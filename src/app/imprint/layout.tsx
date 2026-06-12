import SiteFooter from "@/components/layout/site-footer";

export default function ImprintLayout({
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
