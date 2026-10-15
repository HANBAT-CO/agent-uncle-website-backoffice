import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "서비스 이용약관",
  description: "사입삼춘 애플리케이션의 서비스 이용약관 버전 1.0. 2026년 10월 19일 시행하며, 이용조건과 이용자·운영자의 권리 및 의무를 안내합니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDocument kind="terms" />;
}
