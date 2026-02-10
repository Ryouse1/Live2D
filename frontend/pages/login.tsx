import { FormEvent, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../components/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setMessage("ログインしました。配信一覧に戻ってください。");
    } catch (error) {
      setMessage("ログインに失敗しました。");
    }
  };

  return (
    <Layout title="ログイン">
      <form className="card" onSubmit={handleSubmit}>
        <label>
          メール
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          パスワード
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        <button type="submit">ログイン</button>
        {message && <p className="notice">{message}</p>}
      </form>
      <section className="card">
        <h2>Google OAuth</h2>
        <p>管理画面で設定したGoogle OAuthを利用してログインできます。</p>
        <GoogleLoginButton />
      </section>
    </Layout>
  );
}

function GoogleLoginButton() {
  const [status, setStatus] = useState("");

  const handleClick = async () => {
    setStatus("");
    try {
      const { url } = await apiFetch<{ url: string }>("/api/auth/google/start");
      window.location.href = url;
    } catch (error) {
      setStatus("Google OAuthが未設定です。");
    }
  };

  return (
    <div>
      <button type="button" onClick={handleClick}>
        Googleでログイン
      </button>
      {status && <p className="notice">{status}</p>}
    </div>
  );
}
