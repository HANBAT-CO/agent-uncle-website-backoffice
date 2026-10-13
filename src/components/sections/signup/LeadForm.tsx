"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { submitLead } from "@/app/actions/lead";
import { AppIcon } from "@/components/icons/AppIcon";
import { WarningCircleIcon } from "@/components/icons/PhosphorLight";
import { LeadFormGuards } from "@/components/lead/LeadFormGuards";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { fill, signup } from "@/content/copy";
import { CONSENT } from "@/content/legal";
import { cn } from "@/lib/cn";
import { requestScrollRefresh } from "@/lib/scroll-refresh";
import {
  initialLeadFormState,
  LEAD_FIELDS,
  LEAD_MESSAGES,
  type LeadField,
  type LeadFormState,
  type LeadFormValues,
} from "@/lib/lead/constants";
import { easing } from "@/lib/motion";
import { story } from "@/lib/story/store";
import { LEAD_MARKETS, type LeadMarket } from "@/lib/supabase/types";

import {
  checkLead,
  checkLeadField,
  firstInvalidField,
  type LeadCheckInput,
  type LeadFieldErrors,
} from "./lead-client-checks";
import { draftLines, leadDraftStore, type LeadDraft } from "./lead-draft";
import { RoleCards } from "./RoleCards";
import { formatClock, LEAD_FORM_ID, signupStatus, useSignupStatus } from "./signup-status";
import { LeadSubmitButton } from "./StickySubmit";

/**
 * The 사전 신청 form (spec S10 and 10). A Motion leaf: no GSAP in this tree.
 *
 * Input is never lost:
 * - every field is controlled by the sessionStorage draft (lead-draft.ts),
 *   restored on load; consent is the only field that is not kept
 * - submits are dispatched by hand from onSubmit, so React's automatic form
 *   reset after an action never runs; fields clear only after a success
 * - the action call is wrapped: a stale action id gets one silent retry, and
 *   any rejected call (offline, network) returns an error state with the
 *   app's network string while the inputs stay as they are
 *
 * Checks run on blur (once a field was edited) and on submit, mirroring the
 * schema without zod; the server's field errors override them. Errors are
 * ink with a 2px deep-green rule and Phosphor WarningCircle, never red.
 */

const SOURCE = "landing-signup";

const FIELD_ID: Record<LeadField, string> = {
  role: "lead-role",
  name: "lead-name",
  business_name: "lead-business",
  contact: "lead-contact",
  market: "lead-market",
  message: "lead-message",
  consent: "lead-consent",
};

const ROLE_HEADING_ID = "lead-role-heading";
const MARKET_LABEL_ID = "lead-market-label";
const CONTACT_HELPER_ID = "lead-contact-helper";
const MESSAGE_HELPER_ID = "lead-message-helper";
/** The section's H2 (index.tsx): after a send it comes back into view with the result when both fit. */
const SECTION_HEADING_ID = "signup-title";
/** The page footer, right below the section: a send never lands with it in view. */
const FOOTER_ID = "footer";

const errorId = (field: LeadField) => `${FIELD_ID[field]}-error`;

const MARKET_OPTIONS = LEAD_MARKETS.map((value, index) => ({
  value,
  label: signup.fields.market.options[index] ?? value,
}));

function echoValues(formData: FormData): LeadFormValues {
  const values: LeadFormValues = {};
  for (const field of LEAD_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

function networkFailure(formData: FormData): LeadFormState {
  return { status: "error", message: signup.networkError, fieldErrors: {}, values: echoValues(formData) };
}

/**
 * submitLead with the two client-side failure paths of spec 10: a stale action
 * id (a deploy replaced the action while the page was open) is retried once,
 * then reported like any rejected call with the network string.
 */
async function sendLead(previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  try {
    return await submitLead(previous, formData);
  } catch (error) {
    if (unstable_isUnrecognizedActionError(error)) {
      try {
        return await submitLead(previous, formData);
      } catch {
        return networkFailure(formData);
      }
    }
    return networkFailure(formData);
  }
}

function toCheckInput(draft: LeadDraft, consent: boolean): LeadCheckInput {
  return {
    role: draft.role,
    name: draft.name,
    business_name: draft.business_name,
    contact: draft.contact,
    market: draft.market,
    message: draft.message,
    consent,
  };
}

function withFieldError(errors: LeadFieldErrors, field: LeadField, message: string | undefined): LeadFieldErrors {
  if (errors[field] === message) return errors;
  const next = { ...errors };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

type ScrollTo = ReturnType<typeof useSmoothScroll>["scrollTo"];

/** Below the 72px nav pill with a 16px gap: anything above this line is hidden or crowded. */
const SAFE_TOP = 88;
/** Where a revealed block starts: clear of the nav with room for the eye to land. */
const REVEAL_TOP = 112;

/** The control that takes focus for a field; radio groups give their checked item, else the first. */
function focusTarget(field: LeadField): HTMLElement | null {
  const element = document.getElementById(FIELD_ID[field]);
  if (!element || element.getAttribute("role") !== "radiogroup") return element;
  return (
    element.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ??
    element.querySelector<HTMLElement>('[role="radio"]')
  );
}

/**
 * The band's lower edge: 16px above the viewport bottom or the fixed mobile
 * submit bar wherever it can show (not from 768px, nor on short screens, where
 * signup.css takes it out).
 */
function bandBottom(): number {
  const bar = document.querySelector<HTMLElement>("[data-lead-sticky]");
  const style = bar ? getComputedStyle(bar) : null;
  // offsetHeight, not the rect: the bar may still be sliding in.
  return window.innerHeight - (style?.display === "none" ? 0 : (bar?.offsetHeight ?? 0)) - 16;
}

const SUBMIT_BUTTON_SELECTOR = `#${LEAD_FORM_ID} button[type="submit"], button[type="submit"][form="${LEAD_FORM_ID}"]`;

function setNativeSubmitDisabled(disabled: boolean): void {
  document.querySelectorAll<HTMLButtonElement>(SUBMIT_BUTTON_SELECTOR).forEach((button) => {
    button.disabled = disabled;
  });
}

/**
 * Scroll `element` to REVEAL_TOP unless it already sits whole in the band
 * between the nav and bandBottom(). Lenis-aware through useSmoothScroll; a
 * jump under reduced motion.
 */
function reveal(element: HTMLElement, scrollTo: ScrollTo): void {
  const rect = element.getBoundingClientRect();
  if (rect.top >= SAFE_TOP && rect.bottom <= bandBottom()) return;
  scrollTo(element, { offset: -REVEAL_TOP });
}

/**
 * After a keyboard focus move, nudge the page the least distance that shows
 * the control and its label inside the band. Chromium already lands there
 * through signup.css (scroll-padding and scroll-margin); WebKit's focus
 * scrolling ignores both, leaving labels under the nav and the textarea
 * behind the mobile submit bar, so this finishes the job there.
 */
function keepInBand(control: HTMLElement, scrollTo: ScrollTo): void {
  if (document.activeElement !== control) return;
  const rect = control.getBoundingClientRect();
  const label = control.id ? document.querySelector(`label[for="${control.id}"]`) : null;
  const top = Math.min(rect.top, label?.getBoundingClientRect().top ?? rect.top);
  const limit = bandBottom();
  let delta = 0;
  if (top < SAFE_TOP) delta = top - SAFE_TOP;
  else if (rect.bottom > limit) delta = Math.min(rect.bottom - limit, top - SAFE_TOP);
  if (delta !== 0) scrollTo(window.scrollY + delta, { immediate: true });
}

/**
 * Focus a field by name without the browser's own focus scroll, then bring
 * its whole block into view (the question or label, the control and its
 * error), so a visitor sent back to a problem sees all three together.
 */
function focusField(field: LeadField, scrollTo: ScrollTo): void {
  const target = focusTarget(field);
  if (!target) return;
  target.focus({ preventScroll: true });
  reveal(target.closest<HTMLElement>("[data-lead-field]") ?? target, scrollTo);
}

function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

/** The label text that swaps with the role, cross-fading over 200ms. */
function SwapText({ text, reducedMotion }: { text: string; reducedMotion: boolean }) {
  return (
    <span className="grid">
      <AnimatePresence initial={false}>
        <FadingText key={text} reducedMotion={reducedMotion}>
          {text}
        </FadingText>
      </AnimatePresence>
    </span>
  );
}

function FadingText({ children, reducedMotion }: { children: string; reducedMotion: boolean }) {
  const present = useIsPresent();
  return (
    <motion.span
      className="[grid-area:1/1]"
      aria-hidden={present ? undefined : true}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: easing.snap }}
    >
      {children}
    </motion.span>
  );
}

function FieldError({ field, message }: { field: LeadField; message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      id={errorId(field)}
      data-lead-error={field}
      className="lead-error flex items-start gap-2 border-l-2 border-green-800 py-0.5 pl-3 text-[15px] leading-[1.5] text-ink"
    >
      <WarningCircleIcon weight="light" size={20} aria-hidden="true" className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function Helper({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-[14px] leading-[1.5] text-grey-600">
      {children}
    </p>
  );
}

export function LeadForm({ disclosure }: { disclosure: ReactNode }) {
  const draft = useSyncExternalStore(
    leadDraftStore.subscribe,
    leadDraftStore.getSnapshot,
    leadDraftStore.getServerSnapshot,
  );
  const { sentAt } = useSignupStatus();
  const reducedMotion = useReducedMotion() ?? false;
  const { scrollTo } = useSmoothScroll();

  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<LeadFieldErrors>({});
  const [hiddenBanner, setHiddenBanner] = useState<LeadFormState | null>(null);
  const [submitLocked, setSubmitLocked] = useState(false);
  // Fields the visitor has edited: blur checks only these, so tabbing past an
  // empty field never scolds. Not rendered, so a ref.
  const edited = useRef(new Set<LeadField>());
  const submitLockedRef = useRef(false);
  // After a send, the form fades back in on 다시 신청하기 (never on first load).
  const [sentBefore, setSentBefore] = useState(false);
  const againButton = useRef<HTMLButtonElement>(null);
  // Whether focus is moving by keyboard (Tab since the last pointer press): only
  // those moves get keepInBand, so a click never shifts the page under the pointer.
  const keyboardFocus = useRef(false);

  const lockSubmit = useCallback((locked: boolean) => {
    submitLockedRef.current = locked;
    setSubmitLocked(locked);
    setNativeSubmitDisabled(locked);
  }, []);

  function onSent() {
    const time = formatClock(new Date());
    leadDraftStore.clear();
    edited.current.clear();
    setSentBefore(true);
    setConsent(false);
    setErrors({});
    story.addVisitorRecord({
      kind: "signup",
      time,
      meta: fill(signup.success.meta, { time }),
      title: signup.success.title,
    });
    story.setDraft(null);
    flushSync(() => signupStatus.set({ sentAt: time }));
    // The form just collapsed by 750 to 1300px, so the page may have clamped
    // into the footer. Bring the result in explicitly (WebKit does not scroll
    // to a focused button). On phones this is unconditional, because the send
    // often starts from the sticky bar at the bottom edge.
    //
    // The jump is immediate and runs in this task, right after the synchronous
    // commit and before the next paint: the clamped frame (footer in view, the
    // rail folding into its 업무 기록 pill) is never painted, and the rail's
    // draft card becomes the success card in place while the rail stays open.
    // The result itself still rises in (the sent block's own 700ms entrance).
    //
    // The footer stays below the fold: the rail folds as soon as the footer's
    // wordmark enters the viewport, so the landing stops short of that (the
    // result sits well above the footer, so it stays in view).
    const island = document.querySelector<HTMLElement>("[data-lead-island]");
    if (island) {
      const sheet = island.getBoundingClientRect();
      const heading = document.getElementById(SECTION_HEADING_ID);
      const room = window.innerHeight - REVEAL_TOP - 16;
      const success = island.querySelector<HTMLElement>("[data-lead-sent]");
      const target =
        heading && sheet.bottom - heading.getBoundingClientRect().top <= room ? heading : (success ?? island);
      const footerTop = document.getElementById(FOOTER_ID)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      if (mobile || sheet.top < SAFE_TOP || sheet.bottom > window.innerHeight - 16 || footerTop < window.innerHeight) {
        const y = Math.min(
          target.getBoundingClientRect().top - REVEAL_TOP,
          footerTop - window.innerHeight,
        );
        scrollTo(Math.max(0, window.scrollY + y), { immediate: true });
      }
    }
    againButton.current?.focus({ preventScroll: true });
  }

  const [state, formAction, pending] = useActionState(async (previous: LeadFormState, formData: FormData) => {
    try {
      const result = await sendLead(previous, formData);
      if (result.status === "success") {
        onSent();
      } else if (result.status === "error") {
        const serverErrors = result.fieldErrors;
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          const first = firstInvalidField(serverErrors);
          if (first) focusProblem(first);
        }
      }
      return result;
    } finally {
      lockSubmit(false);
    }
  }, initialLeadFormState);

  const busy = pending || submitLocked;
  const errorCount = Object.keys(errors).length;
  // A server validation failure (입력 내용을 확인해 주세요.) sums up its field
  // errors: once the visitor has fixed the last of them, it has nothing left to
  // say, and it stays away until the next submit (set aside during render, so
  // a later blur error does not bring it back). Retry and network banners
  // stay until the next submit.
  const invalidResolved =
    state.status === "error" &&
    state.message === LEAD_MESSAGES.invalid &&
    Object.keys(state.fieldErrors).length > 0 &&
    errorCount === 0;
  if (invalidResolved && hiddenBanner !== state) setHiddenBanner(state);
  const banner = state.status === "error" && state !== hiddenBanner && !invalidResolved ? state.message : null;

  // External stores follow React state: the status for the sticky bar and the
  // live card, the draft lines for the record rail (WP-02) and the side card.
  useEffect(() => {
    signupStatus.set({ pending: busy });
    setNativeSubmitDisabled(busy);
  }, [busy]);

  // The draft card shows from arrival (역할: 선택 전 while empty), as the side
  // card does between 1024 and 1279px; the rail renders it only while signup
  // is the active section. Never under the success card: after a send the
  // cleared draft must not come back until 다시 신청하기.
  useEffect(() => {
    story.setDraft(sentAt === null ? { lines: draftLines(draft) } : null);
  }, [draft, sentAt]);

  useEffect(() => () => story.setDraft(null), []);

  // The form mounts lazily and changes height (errors, the banner, the sent
  // state): pins and triggers below re-measure (debounced, safe mode).
  useEffect(() => {
    requestScrollRefresh();
  }, [sentAt, errorCount, banner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") keyboardFocus.current = true;
    };
    const onPointerDown = () => {
      keyboardFocus.current = false;
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  /** Send focus to a field and reveal its block; keepInBand stays out of the way of that scroll. */
  function focusProblem(field: LeadField) {
    keyboardFocus.current = false;
    focusField(field, scrollTo);
  }

  function focusMoved(event: FocusEvent<HTMLFormElement>) {
    const control = event.target;
    if (!keyboardFocus.current || !(control instanceof HTMLElement)) return;
    // After the browser's own focus scroll has run.
    requestAnimationFrame(() => keepInBand(control, scrollTo));
  }

  // A reload inside the 400ms debounce must not drop the last keystrokes.
  useEffect(() => {
    const flush = () => leadDraftStore.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function change(field: LeadField, patch: Partial<LeadDraft>) {
    if (busy) return;
    edited.current.add(field);
    leadDraftStore.update(patch);
    // Re-check live only where an error already shows, so it clears the moment the value is right.
    setErrors((current) =>
      current[field] === undefined
        ? current
        : withFieldError(current, field, checkLeadField(field, toCheckInput({ ...draft, ...patch }, consent))),
    );
  }

  function blur(field: LeadField) {
    if (!edited.current.has(field) && errors[field] === undefined) return;
    const message = checkLeadField(field, toCheckInput(leadDraftStore.getSnapshot(), consent));
    setErrors((current) => withFieldError(current, field, message));
  }

  function changeConsent(checked: boolean) {
    if (busy) return;
    setConsent(checked);
    setErrors((current) =>
      current.consent === undefined
        ? current
        : withFieldError(current, "consent", checkLeadField("consent", toCheckInput(draft, checked))),
    );
  }

  function toggleContactMode() {
    if (busy) return;
    leadDraftStore.update({ contactMode: draft.contactMode === "tel" ? "email" : "tel" });
    document.getElementById(FIELD_ID.contact)?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Always handled here: no native submit and no automatic form reset.
    event.preventDefault();
    if (pending || submitLockedRef.current) return;
    const found = checkLead(toCheckInput(leadDraftStore.getSnapshot(), consent));
    const first = firstInvalidField(found);
    if (first) {
      setErrors(found);
      setHiddenBanner(state);
      focusProblem(first);
      return;
    }
    setErrors({});
    // A retry hides the last failure's banner while it is pending; a new
    // failure returns a new state object, so it still shows.
    setHiddenBanner(state);
    leadDraftStore.flush();
    // new FormData fires `formdata`, where LeadFormGuards adds the fill time.
    const formData = new FormData(event.currentTarget);
    lockSubmit(true);
    startTransition(() => formAction(formData));
  }

  function again() {
    flushSync(() => signupStatus.set({ sentAt: null }));
    focusProblem("role");
  }

  const business = signup.fields.business[draft.role === "" ? "retailer" : draft.role];
  const contactMode = draft.contactMode;
  // The shared length message names one label; name the one on screen instead.
  const businessError =
    errors.business_name === LEAD_MESSAGES.businessNameTooLong
      ? fill(signup.businessTooLong, { label: business.short })
      : errors.business_name;

  return (
    <div className="relative">
      {/* Form status for assistive tech (spec 14: polite). */}
      <p role="status" aria-live="polite" className="sr-only">
        {sentAt !== null ? LEAD_MESSAGES.success : (banner ?? "")}
      </p>

      {sentAt !== null ? (
        <motion.div
          key={`sent-${sentAt}`}
          className="flex flex-col items-start gap-5 py-2"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.7, ease: easing.snap }}
        >
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-pill bg-accent-weak text-green-800">
            <AppIcon name="check" size={24} />
          </span>
          <p className="text-heading-md text-ink" data-lead-sent="">
            {LEAD_MESSAGES.success}
          </p>
          <button
            ref={againButton}
            type="button"
            onClick={again}
            className="-mx-2.5 -my-2 inline-flex min-h-11 items-center rounded-pill px-2.5 text-[17px] leading-none font-bold text-green-800 underline decoration-1 underline-offset-4 transition-[text-decoration-thickness] duration-200 ease-snap hover:decoration-2"
          >
            {signup.again}
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="form"
          initial={sentBefore && !reducedMotion ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.7, ease: easing.snap }}
        >
          <form
            id={LEAD_FORM_ID}
            noValidate
            action={formAction}
            onSubmit={handleSubmit}
            onFocus={focusMoved}
            aria-busy={busy || undefined}
            className="flex flex-col gap-10"
          >
            {/* The fill clock runs from the draft's first edit, which survives a reload with the draft. */}
            <LeadFormGuards source={SOURCE} firstEditAt={leadDraftStore.firstEditAt} />

            <div data-lead-field="role" className="flex flex-col gap-4">
              <h3 id={ROLE_HEADING_ID} className="text-heading-md text-ink">
                {signup.roleLegend}
              </h3>
              <RoleCards
                id={FIELD_ID.role}
                value={draft.role}
                onValueChange={(role) => change("role", { role })}
                labelledBy={ROLE_HEADING_ID}
                describedBy={errors.role ? errorId("role") : undefined}
                invalid={errors.role !== undefined}
                readOnly={busy}
              />
              <FieldError field="role" message={errors.role} />
            </div>

            {/*
              From 1280px the short fields pair up: name with business, contact with
              market (chips at px-4 there; the sheet spans the stage, so each column is
              about 377px at 1280 and 440px at 1440).
            */}
            <div className="flex flex-col gap-7 xl:grid xl:grid-cols-2 xl:gap-x-6">
              <div data-lead-field="name" className="flex flex-col gap-2">
                <Label htmlFor={FIELD_ID.name}>{signup.fields.name.label}</Label>
                <Input
                  id={FIELD_ID.name}
                  name="name"
                  autoComplete="name"
                  value={draft.name}
                  readOnly={busy}
                  required
                  aria-invalid={errors.name !== undefined || undefined}
                  aria-describedby={describedBy(errors.name && errorId("name"))}
                  onChange={(event) => change("name", { name: event.currentTarget.value })}
                  onBlur={() => blur("name")}
                />
                <FieldError field="name" message={errors.name} />
              </div>

              <div data-lead-field="business_name" className="flex flex-col gap-2">
                <Label htmlFor={FIELD_ID.business_name}>
                  <SwapText text={business.label} reducedMotion={reducedMotion} />
                </Label>
                <Input
                  id={FIELD_ID.business_name}
                  name="business_name"
                  autoComplete="organization"
                  value={draft.business_name}
                  readOnly={busy}
                  aria-invalid={businessError !== undefined || undefined}
                  aria-describedby={describedBy(businessError && errorId("business_name"))}
                  onChange={(event) => change("business_name", { business_name: event.currentTarget.value })}
                  onBlur={() => blur("business_name")}
                />
                <FieldError field="business_name" message={businessError} />
              </div>

              <div data-lead-field="contact" className="flex flex-col gap-2">
                <div className="flex items-end justify-between gap-4">
                  <Label htmlFor={FIELD_ID.contact}>{signup.fields.contact.label}</Label>
                  <button
                    type="button"
                    onClick={toggleContactMode}
                    disabled={busy}
                    aria-disabled={busy || undefined}
                    aria-controls={FIELD_ID.contact}
                    className="-mx-2.5 -my-3 inline-flex min-h-11 items-center rounded-pill px-2.5 text-[14px] leading-none font-bold text-green-800 underline decoration-1 underline-offset-4 transition-[text-decoration-thickness] duration-200 ease-snap hover:decoration-2"
                  >
                    {contactMode === "tel" ? signup.fields.contact.toEmail : signup.fields.contact.toPhone}
                  </button>
                </div>
                <Input
                  id={FIELD_ID.contact}
                  name="contact"
                  inputMode={contactMode}
                  autoComplete={contactMode}
                  autoCapitalize="off"
                  spellCheck={false}
                  value={draft.contact}
                  readOnly={busy}
                  required
                  aria-invalid={errors.contact !== undefined || undefined}
                  aria-describedby={describedBy(CONTACT_HELPER_ID, errors.contact && errorId("contact"))}
                  onChange={(event) => change("contact", { contact: event.currentTarget.value })}
                  onBlur={() => blur("contact")}
                />
                <Helper id={CONTACT_HELPER_ID}>{signup.fields.contact.helper}</Helper>
                <FieldError field="contact" message={errors.contact} />
              </div>

              <div data-lead-field="market" className="flex flex-col gap-3">
                <span id={MARKET_LABEL_ID} className="text-[15px] leading-[1.4] font-bold text-grey-800">
                  {signup.fields.market.label}
                </span>
                <RadioGroup
                  id={FIELD_ID.market}
                  name="market"
                  orientation="horizontal"
                  value={draft.market}
                  onValueChange={(value) => change("market", { market: value as LeadMarket })}
                  aria-labelledby={MARKET_LABEL_ID}
                  aria-describedby={describedBy(errors.market && errorId("market"))}
                  aria-readonly={busy || undefined}
                  className="flex flex-wrap gap-2"
                >
                  {MARKET_OPTIONS.map((option) => (
                    <RadioGroupItem
                      key={option.value}
                      value={option.value}
                      aria-describedby={describedBy(errors.market && errorId("market"))}
                      onClick={() => {
                        // Optional field: the selected chip clears it again.
                        if (draft.market === option.value) change("market", { market: "" });
                      }}
                      className={cn(
                        "inline-flex h-11 items-center rounded-pill border border-grey-300 bg-surface px-5 text-[15px] xl:px-4 leading-none font-bold text-grey-800",
                        "transition-[background-color,border-color,color,scale] duration-200 ease-snap active:scale-[0.98]",
                        "hover:border-grey-500 data-[state=checked]:border-green-800 data-[state=checked]:bg-green-800 data-[state=checked]:text-surface",
                      )}
                    >
                      {option.label}
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
                <FieldError field="market" message={errors.market} />
              </div>

              <div data-lead-field="message" className="flex flex-col gap-2 xl:col-span-2">
                <Label htmlFor={FIELD_ID.message}>{signup.fields.message.label}</Label>
                <Textarea
                  id={FIELD_ID.message}
                  name="message"
                  value={draft.message}
                  readOnly={busy}
                  aria-invalid={errors.message !== undefined || undefined}
                  aria-describedby={describedBy(MESSAGE_HELPER_ID, errors.message && errorId("message"))}
                  onChange={(event) => change("message", { message: event.currentTarget.value })}
                  onBlur={() => blur("message")}
                />
                <Helper id={MESSAGE_HELPER_ID}>{signup.fields.message.helper}</Helper>
                <FieldError field="message" message={errors.message} />
              </div>
            </div>

            <div data-lead-field="consent" className="flex flex-col gap-3 border-t border-grey-200 pt-7">
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id={FIELD_ID.consent}
                  name="consent"
                  checked={consent}
                  onCheckedChange={(checked) => changeConsent(checked === true)}
                  required
                  aria-invalid={errors.consent !== undefined || undefined}
                  aria-describedby={describedBy(errors.consent && errorId("consent"))}
                  aria-readonly={busy || undefined}
                />
                <Label htmlFor={FIELD_ID.consent} className="min-h-11 cursor-pointer py-2 text-[16px] text-ink">
                  {CONSENT.label}
                </Label>
              </div>
              {disclosure}
              <FieldError field="consent" message={errors.consent} />
            </div>

            {banner ? (
              <div
                data-lead-banner=""
                className="lead-error flex items-start gap-3 rounded-input bg-grey-100 py-4 pr-4 pl-4 text-[15px] leading-[1.55] text-ink shadow-[inset_2px_0_0_var(--color-green-800)]"
              >
                <WarningCircleIcon weight="light" size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p>{banner}</p>
              </div>
            ) : null}

            {/*
              The form's own 사전 신청, under the consent row at every width. Below
              768px the fixed bar (StickySubmit) stands in for it until it rises
              to the bar's place, so the dock spans the sheet like the bar does.
            */}
            <div data-lead-submit-dock="" className="flex">
              <LeadSubmitButton pending={busy} className="w-full md:w-auto" />
            </div>
          </form>
        </motion.div>
      )}
    </div>
  );
}
