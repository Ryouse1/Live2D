import { FormEvent, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../components/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("viewer");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName, role })
      });
      setMessage("登録が完了しました。配信一覧へ移動できます。");
    } catch (error) {
      setMessage("登録に失敗しました。");
    }
  };

  return (
    <Layout title="新規登録">
      <form className="card" onSubmit={handleSubmit}>
        <label>
          表示名
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
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
        <label>
          ロール
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="viewer">視聴者</option>
            <option value="streamer">配信者</option>
            <option value="admin">管理者</option>
          </select>
        </label>
        <button type="submit">登録</button>
        {message && <p className="notice">{message}</p>}
      </form>
    </Layout>
  );
}
