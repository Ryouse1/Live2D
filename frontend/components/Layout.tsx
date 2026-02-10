import Link from "next/link";

interface LayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function Layout({ title, children }: LayoutProps) {
  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>{title}</h1>
          <p className="subtitle">Vtuber向けライブ配信サービス (MVP)</p>
        </div>
        <nav className="nav">
          <Link href="/">配信一覧</Link>
          <Link href="/login">ログイン</Link>
          <Link href="/register">新規登録</Link>
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
