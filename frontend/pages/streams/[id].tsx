import { useRouter } from "next/router";
import { FormEvent, useEffect, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { apiFetch, API_BASE } from "../../components/api";

interface ChatMessage {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export default function StreamDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!id || Array.isArray(id)) {
      return;
    }

    const loadHistory = async () => {
      try {
        const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/streams/${id}/chat`);
        setMessages(data.messages);
      } catch (error) {
        setNotice("ログインが必要です。");
      }
    };

    void loadHistory();
  }, [id]);

  useEffect(() => {
    if (!id || Array.isArray(id)) {
      return;
    }

    const wsUrl = API_BASE.replace(/^http/, "ws") + `/ws?streamId=${id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data) as
        | { type: "chat_message"; id: string; author: string; content: string; createdAt: string }
        | { type: "stream_stopped"; reason: string }
        | { type: "rate_limited"; message: string };

      if (payload.type === "chat_message") {
        setMessages((prev) => [...prev, payload]);
      }
      if (payload.type === "stream_stopped") {
        setNotice(`配信が中止されました: ${payload.reason}`);
      }
      if (payload.type === "rate_limited") {
        setNotice(payload.message);
      }
    };

    ws.onclose = () => {
      setNotice((prev) => prev || "接続が切断されました。");
    };

    return () => {
      ws.close();
    };
  }, [id]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setNotice("接続が確立していません。");
      return;
    }
    if (!input.trim()) {
      return;
    }
    ws.send(input.trim());
    setInput("");
  };

  return (
    <Layout title="配信視聴">
      {notice && <p className="notice">{notice}</p>}
      <section className="card">
        <h2>チャット</h2>
        <div className="chat">
          {messages.map((message) => (
            <div key={message.id} className="chat-line">
              <strong>{message.author}</strong>
              <span>{message.content}</span>
              <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={handleSubmit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} />
          <button type="submit">送信</button>
        </form>
      </section>
    </Layout>
  );
}
