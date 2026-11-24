'use client';

import type DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Bot,
  Camera,
  HelpCircle,
  Loader2,
  Send,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { marked } from 'marked';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatLog, AnalyzedMedication } from 'types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { useTTS } from '@/hooks/useTTS';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

let domPurifyPromise: Promise<typeof DOMPurify> | undefined;

function loadDOMPurify() {
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default ?? mod);
  return domPurifyPromise;
}

function SanitizedMarkdown({ content }: { readonly content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const rawHtml = marked.parse(content) as string;

    if ('setHTML' in Element.prototype) {
      (el as HTMLDivElement & { setHTML: (html: string) => void }).setHTML(rawHtml);
    } else {
      loadDOMPurify()
        .then((DOMPurify) => {
          if (!cancelled && containerRef.current) {
            containerRef.current.innerHTML = DOMPurify.sanitize(rawHtml);
          }
        })
        .catch((err) => {
          logger.error({ err }, 'DOMPurify 로드 실패');
        });
    }

    return () => {
      cancelled = true;
    };
  }, [content]);

  return <div ref={containerRef} className="prose prose-sm max-w-none dark:prose-invert" />;
}

const ChatInquiryModal = dynamic(
  () => import('@/components/chat/ChatInquiryModal').then((mod) => mod.ChatInquiryModal),
  {
    ssr: false,
    loading: () => <p className="hidden">로딩 중...</p>,
  },
);

const ChatVisualModal = dynamic(
  () => import('@/components/chat/ChatVisualModal').then((mod) => mod.ChatVisualModal),
  {
    ssr: false,
    loading: () => <p className="hidden">로딩 중...</p>,
  },
);

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  isGreeting?: boolean;
}

const INITIAL_GREETING =
  '안녕하세요! Pilly AI 복약 가이드입니다. 약물 복용법이나 주의사항에 대해 무엇이든 물어보세요.';
const MAX_HISTORY_MESSAGES = 10;

/**
 * 개별 채팅 세션 내에서 AI와 대화를 주고받는 페이지 컴포넌트입니다.
 *
 * @returns 채팅 세션 페이지 UI
 */
export default function ChatSessionPage(): React.ReactNode {
  const params = useParams();
  const router = useRouter();
  const { apiFetch } = useApi();
  const sessionId = params.sessionId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { speak, stopSpeaking, ttsSupported } = useTTS();
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  const [analyzedMeds, setAnalyzedMeds] = useState<AnalyzedMedication[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/chat/sessions/${sessionId}`);
      if (!res.ok) throw new Error('세션 로드 실패');
      const result = (await res.json()) as { logs: AiChatLog[] };

      const history: Message[] = [];
      if (result.logs.length === 0) {
        history.push({
          id: crypto.randomUUID(),
          role: 'ai',
          content: INITIAL_GREETING,
          isGreeting: true,
        });
      } else {
        result.logs.forEach((log) => {
          history.push(
            { id: crypto.randomUUID(), role: 'user', content: log.prompt },
            { id: crypto.randomUUID(), role: 'ai', content: log.response },
          );
        });
      }
      setMessages(history);
    } catch (err) {
      logger.error({ err }, '채팅 기록 조회 실패');
    } finally {
      setIsInitializing(false);
    }
  }, [sessionId, apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchHistory();
    });
  }, [fetchHistory]);

  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleTts = () => {
    if (ttsEnabled) {
      stopSpeaking();
    }
    setTtsEnabled((prev) => !prev);
  };

  const updateLastMessage = useCallback((updater: (currentContent: string) => string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const lastIndex = prev.length - 1;
      return prev.map((msg, index) =>
        index === lastIndex ? { ...msg, content: updater(msg.content) } : msg,
      );
    });
  }, []);

  /**
   * 사용자 질문 텍스트를 받아 AI 스트리밍 응답을 수신합니다.
   * 초기 로컬 인사말(`isGreeting`)은 Gemini 멀티턴 규격 보호를 위해 API payload에서 제외합니다.
   */
  const sendPrompt = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isLoading) return;

      const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text };
      const conversationMessages = [...messages, userMessage];

      setMessages([...conversationMessages, { id: crypto.randomUUID(), role: 'ai', content: '' }]);
      setIsLoading(true);

      try {
        const historyPayload = conversationMessages
          .filter((msg) => !msg.isGreeting && msg.content.trim().length > 0)
          .slice(-MAX_HISTORY_MESSAGES)
          .map((msg) => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          }));

        const response = await apiFetch(`/chat/sessions/${sessionId}/message`, {
          method: 'POST',
          body: JSON.stringify({ history: historyPayload }),
        });

        if (!response.ok) throw new Error('메시지 전송 실패');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            updateLastMessage((current) => current + chunk);
          }
          const flushChunk = decoder.decode();
          if (flushChunk) {
            fullResponse += flushChunk;
            updateLastMessage((current) => current + flushChunk);
          }
          if (ttsEnabled && fullResponse.trim()) {
            speak(fullResponse);
          }
        }
        globalThis.dispatchEvent(new Event('refresh-sessions'));
      } catch (err) {
        logger.error({ err }, '채팅 메시지 전송 오류');
        updateLastMessage(() => '네트워크 연결 상태를 확인해 주세요.');
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch, isLoading, messages, sessionId, speak, ttsEnabled, updateLastMessage],
  );

  const handleSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await sendPrompt(text);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await apiFetch('/medications/analyze-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('분석 실패');
      const result = await res.json();
      if (result.success) {
        setAnalyzedMeds(
          (result.data as AnalyzedMedication[]).map((m) => ({
            ...m,
            id: crypto.randomUUID(),
            checked: true,
          })),
        );
        setIsVisionModalOpen(true);
      }
    } catch (err) {
      logger.error({ err }, '처방전/약봉투 이미지 분석 오류');
      alert('이미지 분석에 실패했습니다.');
    } finally {
      setIsAnalyzingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVisionConfirm = async () => {
    const medsToAdd = analyzedMeds.filter((m) => m.checked && m.name.trim().length > 0);
    if (medsToAdd.length === 0) {
      setIsVisionModalOpen(false);
      return;
    }

    setIsVisionModalOpen(false);
    setIsLoading(true);
    let addedSuccessfully = false;
    try {
      const responses = await Promise.all(
        medsToAdd.map((med) =>
          apiFetch('/medications', {
            method: 'POST',
            body: JSON.stringify({
              name: med.name.trim(),
              dosage: med.dosage.trim(),
              frequency: med.frequency.trim(),
              startDate: new Date().toISOString(),
            }),
          }),
        ),
      );
      if (responses.some((res) => !res.ok)) {
        throw new Error('약물 등록 요청 중 일부가 실패했습니다.');
      }
      addedSuccessfully = true;
    } catch (err) {
      logger.error({ err }, '인식 약물 저장 오류');
      alert('약물 추가 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }

    if (addedSuccessfully) {
      const summary = medsToAdd
        .map((m) => (m.dosage ? `${m.name}(${m.dosage})` : m.name))
        .join(', ');
      await sendPrompt(
        `방금 처방전 사진으로 [${summary}]을(를) 내 복약 목록에 추가했어요. 복용 시 주의할 점이나 상호작용을 안내해 주세요.`,
      );
    }
  };

  const renderContent = (msg: Message): React.ReactNode => {
    if (msg.role === 'ai') {
      return <SanitizedMarkdown content={msg.content} />;
    }
    return msg.content;
  };

  if (isInitializing) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100dvh-140px)] flex flex-col relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push('/chat')}
            aria-label="채팅 목록으로 돌아가기"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="text-primary" aria-hidden="true" /> AI 복약 상담
              <Badge
                variant="outline"
                className="ml-2 text-green-700 border-green-700 dark:text-green-400 dark:border-green-400"
              >
                초개인화 모드 ON
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Pilly 초개인화 AI 상담</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ttsSupported && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleTts}
              className={cn(ttsEnabled && 'text-primary border-primary bg-primary/5')}
              aria-label={ttsEnabled ? '음성 안내 끄기' : '음성 안내 켜기'}
            >
              {ttsEnabled ? (
                <Volume2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <VolumeX className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="1:1 문의하기"
            onClick={() => setIsInquiryModalOpen(true)}
          >
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </Button>

          <ChatInquiryModal
            isOpen={isInquiryModalOpen}
            onOpenChange={setIsInquiryModalOpen}
            sessionId={sessionId}
          />
        </div>
      </div>

      <ChatVisualModal
        isOpen={isVisionModalOpen}
        onOpenChange={setIsVisionModalOpen}
        analyzedMeds={analyzedMeds}
        setAnalyzedMeds={setAnalyzedMeds}
        onConfirm={handleVisionConfirm}
      />

      <Card className="flex-1 overflow-hidden flex flex-col shadow-inner bg-muted/10">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex items-start gap-3 max-w-[85%]',
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted-foreground/20 text-muted-foreground',
                )}
              >
                {msg.role === 'user' ? (
                  <User size={16} aria-hidden="true" />
                ) : (
                  <Bot size={16} aria-hidden="true" />
                )}
              </div>
              <div
                className={cn(
                  'px-4 py-2 rounded-2xl text-sm shadow-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-background border rounded-tl-none w-full',
                )}
              >
                {msg.role === 'ai' && msg.content === '' && isLoading
                  ? 'AI가 답변을 작성 중입니다...'
                  : renderContent(msg)}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-background border-t">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
              aria-label="약봉투 또는 처방전 이미지 선택"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 px-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isAnalyzingImage}
              aria-label="사진으로 약 추가"
            >
              {isAnalyzingImage ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Camera size={18} aria-hidden="true" />
              )}
            </Button>
            <Input
              placeholder="약물 궁금증을 물어보세요..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 h-11 text-base md:text-sm"
              aria-label="채팅 입력"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-11 px-4"
              aria-label="메시지 전송"
            >
              <Send size={18} aria-hidden="true" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
