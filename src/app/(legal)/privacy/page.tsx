import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "사입삼춘 애플리케이션의 개인정보 처리방침. 개인정보 처리 항목, 목적, 보유기간과 이용자의 권리를 안내하는 버전 1.0 초안입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalDocument kind="privacy" />;
}
