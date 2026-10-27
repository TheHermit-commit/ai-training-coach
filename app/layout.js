// Required by the Next.js App Router. The visible UI lives in /public/index.html.
export const metadata = { title: "Tempo Coach" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
