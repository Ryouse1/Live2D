import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { apiFetch } from "../components/api";

interface StreamInfo {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  stoppedReason?: string;
  ownerName: string;
}

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "streamer" | "viewer";
}

export default function HomePage() {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = async () => {
    try {
      const me = await apiFetch<UserInfo>("/api/auth/me");
      setUser(me);
      const data = await apiFetch<{ streams: StreamInfo[] }>("/api/streams");
      setStreams(data.streams);
    } catch (error) {
      setNotice("ログインしてください。");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleStart = async () => {
    setNotice("");
    try {
      await apiFetch("/api/streams", {
        method: "POST",
        body: JSON.stringify({ title })
      });
      setTitle("");
      await loadData();
    } catch (error) {
      setNotice("配信開始に失敗しました。");
    }
  };

  const handleStop = async (id: string) => {
    const reason = window.prompt("中止理由を入力してください。") ?? "";
    try {
      await apiFetch(`/api/streams/${id}/stop`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      await loadData();
    } catch (error) {
      setNotice("中止に失敗しました。");
    }
  };

  return (
    <Layout title="配信一覧">
      {notice && <p className="notice">{notice}</p>}
      {user && (user.role === "streamer" || user.role === "admin") && (
        <section className="card">
          <h2>配信開始</h2>
          <div className="row">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="配信タイトル"
            />
            <button type="button" onClick={handleStart} disabled={!title}>
              開始
            </button>
          </div>
        </section>
      )}
      <section className="grid">
        {streams.map((stream) => (
          <div key={stream.id} className="card">
            <h3>{stream.title}</h3>
            <p>配信者: {stream.ownerName}</p>
            <p>ステータス: {stream.status}</p>
            {stream.status === "stopped" && stream.stoppedReason && (
              <p>中止理由: {stream.stoppedReason}</p>
            )}
            <div className="row">
              <Link href={`/streams/${stream.id}`}>視聴・チャット</Link>
              {(user?.role === "admin" || user?.displayName === stream.ownerName) && (
                <button type="button" onClick={() => handleStop(stream.id)}>
                  中止
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </Layout>
  );
}
