import SiteFooter from "@/components/layout/site-footer";

export default function DsaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
