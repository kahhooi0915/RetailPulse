import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { Bot, Minus, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = "http://localhost:5000";
const STORAGE_KEY = "retailpulse_ai_chat_history_v2";

const ALLOWED_PATHS = new Set([
    "/admin",
    "/admin/inventory",
    "/admin/warehouse",
    "/manager-stock-transfer",
    "/admin/sales",
    "/admin/reports",
]);

const SUGGESTED_QUESTIONS = [
    "Which products should be reordered immediately?",
    "Which product is expected to become the top seller next month?",
    "Which branch currently requires the most attention?",
    "Summarize current inventory status.",
    "Summarize sales performance.",
];

const DEFAULT_MESSAGES = [
    {
        sender: "bot",
        text: "Hi there! I am your RetailPulse AI Business Assistant. I can analyze sales, inventory, forecasts, and operational risks to support decisions. I cannot create, update, approve, reject, or modify records.",
        suggestedQuestions: SUGGESTED_QUESTIONS,
    },
];

function withSuggestedQuestions(message) {
    if (message?.sender !== "bot") return message;
    return {
        ...message,
        suggestedQuestions: message.suggestedQuestions || SUGGESTED_QUESTIONS,
    };
}

export default function FloatingAIAssistant({ notificationCount = 0 }) {
    const location = useLocation();
    const chatEndRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
            return Array.isArray(saved) && saved.length > 0
                ? saved.map(withSuggestedQuestions)
                : DEFAULT_MESSAGES;
        } catch {
            return DEFAULT_MESSAGES;
        }
    });

    const shouldShow = ALLOWED_PATHS.has(location.pathname);
    useEffect(() => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen, isMinimized, isLoading]);

    useEffect(() => {
        if (!shouldShow) {
            const frameId = window.requestAnimationFrame(() => {
                setIsOpen(false);
                setIsMinimized(false);
            });

            return () => window.cancelAnimationFrame(frameId);
        }
    }, [shouldShow]);

    if (!shouldShow) return null;

    const sendMessage = async (suggestedText = null) => {
        const question = suggestedText || input.trim();
        if (!question || isLoading) return;

        setMessages((prev) => [...prev, { sender: "user", text: question }]);
        setInput("");
        setIsLoading(true);

        try {
            console.log("Calling AI API:", question);
            const response = await axios.post(`${API_BASE}/api/ai/chat`, { question });
            console.log("AI API response:", response.data);

            setMessages((prev) => [
                ...prev,
                {
                    sender: "bot",
                    text: response.data.answer || "AI service is currently unavailable. Please try again later.",
                    suggestedQuestions: response.data.suggested_questions || SUGGESTED_QUESTIONS,
                },
            ]);
        } catch (error) {
            console.error("AI assistant error:", error);
            const responseData = error.response?.data;
            setMessages((prev) => [
                ...prev,
                {
                    sender: "bot",
                    text: responseData?.answer || "AI service is currently unavailable. Please try again later.",
                    suggestedQuestions: responseData?.suggested_questions || SUGGESTED_QUESTIONS,
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[80]">
            {isOpen && !isMinimized && (
                <div className="mb-4 w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl lg:w-[460px]">
                    <div className="flex items-center justify-between bg-[#07102f] px-5 py-4 text-white">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9edf8] text-[#1e4db7]">
                                <Bot size={22} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-lg font-extrabold">RetailPulse AI</h2>
                                <p className="truncate text-xs font-semibold text-blue-100">
                                    Decision-support assistant
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsMinimized(true)}
                                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                                title="Minimize assistant"
                            >
                                <Minus size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                                title="Close assistant"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[min(560px,62vh)] overflow-y-auto bg-[#f8fcff] px-5 py-5">
                        <div className="space-y-4">
                            {messages.map((message, index) => (
                                <div
                                    key={`${message.sender}-${index}`}
                                    className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    {message.sender === "user" ? (
                                        <div className="max-w-[82%] overflow-hidden rounded-2xl bg-[#0c2f73] px-4 py-3 text-sm leading-6 text-white shadow-sm break-words">
                                            {message.text}
                                        </div>
                                    ) : (
                                        <div className="flex w-full max-w-[86%] flex-col items-start gap-3">
                                            <AIResponseCard text={message.text} />
                                            {Array.isArray(message.suggestedQuestions) && message.suggestedQuestions.length > 0 && (
                                                <SuggestedQuestions
                                                    questions={message.suggestedQuestions}
                                                    isLoading={isLoading}
                                                    onSelect={sendMessage}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="max-w-[82%] rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-[#17325c] shadow-sm">
                                        Thinking with RetailPulse data...
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    </div>

                    <div className="border-t border-blue-100 bg-white p-4">
                        <div className="flex items-center gap-3 rounded-2xl border-2 border-blue-200 bg-white px-4 py-3">
                            <input
                                value={input}
                                disabled={isLoading}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") sendMessage();
                                }}
                                placeholder="Ask about sales, inventory, forecasts..."
                                className="min-w-0 flex-1 bg-transparent text-sm text-[#17325c] outline-none placeholder:text-[#6f85a3]"
                            />
                            <button
                                type="button"
                                disabled={isLoading || !input.trim()}
                                onClick={() => sendMessage()}
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0c2f73] text-white transition hover:bg-[#103986] disabled:cursor-wait disabled:bg-gray-300"
                                title="Send message"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="group relative">
                <button
                    type="button"
                    onClick={() => {
                        if (!isOpen) {
                            setIsOpen(true);
                            setIsMinimized(false);
                            return;
                        }

                        setIsMinimized((prev) => !prev);
                    }}
                    className="relative grid h-16 w-16 place-items-center rounded-full bg-[#0c2f73] text-white shadow-2xl transition duration-200 ease-out hover:scale-[1.05] hover:bg-[#103986]"
                    title="AI Business Assistant"
                    aria-label="AI Business Assistant"
                >
                    <Bot size={30} />
                    {notificationCount > 0 && (
                        <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-extrabold leading-none text-white">
                            {notificationCount > 9 ? "9+" : notificationCount}
                        </span>
                    )}
                </button>
                <div className="pointer-events-none absolute bottom-20 right-0 whitespace-nowrap rounded-xl bg-[#07102f] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    AI Business Assistant
                </div>
            </div>
        </div>
    );
}

function AIResponseCard({ text }) {
    return (
        <div className="w-full overflow-hidden rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm leading-6 text-[#17325c] shadow-sm">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="mb-3 mt-1 text-2xl font-extrabold leading-tight text-[#07102f]">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="mb-3 mt-4 text-xl font-extrabold leading-tight text-[#07102f] first:mt-0">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="mb-2 mt-4 text-lg font-extrabold leading-tight text-[#0c2f73] first:mt-0">
                            {children}
                        </h3>
                    ),
                    p: ({ children }) => (
                        <p className="my-3 whitespace-pre-wrap break-words first:mt-0 last:mb-0">
                            {children}
                        </p>
                    ),
                    strong: ({ children }) => (
                        <strong className="rounded-md bg-[#e8f2ff] px-1.5 py-0.5 font-extrabold text-[#0c2f73]">
                            {children}
                        </strong>
                    ),
                    ul: ({ children }) => (
                        <ul className="my-3 list-disc space-y-2 pl-6 marker:text-[#1e4db7]">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="my-3 list-decimal space-y-2 pl-6 marker:font-extrabold marker:text-[#1e4db7]">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => <li className="break-words pl-1">{children}</li>,
                    table: ({ children }) => (
                        <div className="my-4 w-full overflow-x-auto rounded-xl border border-blue-100">
                            <table className="min-w-full border-collapse bg-white text-left text-sm">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="bg-[#eef6fb] text-xs uppercase text-[#17325c]">
                            {children}
                        </thead>
                    ),
                    tbody: ({ children }) => <tbody className="divide-y divide-blue-100">{children}</tbody>,
                    th: ({ children }) => (
                        <th className="whitespace-nowrap px-4 py-3 font-extrabold">{children}</th>
                    ),
                    td: ({ children }) => (
                        <td className="max-w-[260px] px-4 py-3 align-top break-words">{children}</td>
                    ),
                    code: ({ children }) => (
                        <code className="rounded-md bg-[#eef6fb] px-1.5 py-0.5 text-xs font-bold text-[#0c2f73] break-words">
                            {children}
                        </code>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="my-4 border-l-4 border-[#1e4db7] bg-[#f8fcff] px-4 py-3 font-semibold text-[#17325c]">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

function SuggestedQuestions({ questions, isLoading, onSelect }) {
    return (
        <div className="w-full rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#07102f]">
                <Sparkles size={17} className="text-[#1e4db7]" />
                Suggested questions
            </div>
            <div className="space-y-2">
                {questions.map((question) => (
                    <button
                        key={question}
                        type="button"
                        disabled={isLoading}
                        onClick={() => onSelect(question)}
                        className="w-full rounded-xl border border-blue-100 bg-[#f8fcff] px-4 py-3 text-left text-sm font-semibold text-[#17325c] transition hover:border-[#1e4db7] hover:bg-[#eef6fb] disabled:cursor-wait disabled:opacity-70"
                    >
                        {question}
                    </button>
                ))}
            </div>
        </div>
    );
}
