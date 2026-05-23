import "./globals.css";

export const metadata = {
  title: "持仓分析仪",
  description: "手机上传持仓截图，私密解析并生成脱敏分享卡片"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
