import type { Metadata } from "next";
import type { ComponentType } from "react";

import { Chrome } from "@/components/chrome/Chrome";
import { CartSection } from "@/components/sections/cart";
import { DawnSection } from "@/components/sections/dawn";
import { FilmSection } from "@/components/sections/film";
import { FooterSection } from "@/components/sections/footer";
import { HeroSection } from "@/components/sections/hero";
import { ReceiptSection } from "@/components/sections/receipt";
import { RolesSection } from "@/components/sections/roles";
import { RouteSection } from "@/components/sections/route";
import { SignupSection } from "@/components/sections/signup";
import { TrustSection } from "@/components/sections/trust";
import { WordsSection } from "@/components/sections/words";
import { JsonLd } from "@/components/seo/JsonLd";
import { SECTION_ORDER, type SectionId } from "@/content/story";
import { MAIN_CONTENT_ID, site } from "@/lib/site";

// The root layout sets no canonical (metadata merges down to every route);
// the home page owns "/". Indexable: no robots override.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: site.title,
    description: site.description,
    url: "/",
  },
};

const MAIN_SECTIONS: Record<Exclude<SectionId, "footer">, ComponentType> = {
  hero: HeroSection,
  words: WordsSection,
  route: RouteSection,
  cart: CartSection,
  dawn: DawnSection,
  receipt: ReceiptSection,
  roles: RolesSection,
  trust: TrustSection,
  film: FilmSection,
  signup: SignupSection,
};

/**
 * One night of one request, told by scroll (spec 3.1). Sections render in
 * SECTION_ORDER; each owns its folder under src/components/sections and never
 * imports another. The footer sits outside main as the page's footer landmark.
 */
export default function Home() {
  return (
    <>
      <Chrome />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
        {SECTION_ORDER.map((id) => {
          if (id === "footer") return null;
          const Section = MAIN_SECTIONS[id];
          return <Section key={id} />;
        })}
      </main>
      <FooterSection />
      <JsonLd />
    </>
  );
}
