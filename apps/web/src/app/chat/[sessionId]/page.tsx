'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  User,
  Send,
  Loader2,
  ArrowLeft,
  HelpCircle,
  Camera,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import dynamic from 'next/dynamic';

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
  role: 'user' | 'ai';
  content: string;
}

interface ChatLog {
  prompt: string;
  response: string;
}

interface AnalyzedMed {
  name: string;
  dosage: string;
  frequency: string;
  checked?: boolean;
}

/**
 * 개별 채팅 세션 내에서 AI와 대화를 주고받는 페이지 컴포넌트입니다.
 *
 * @description
 * 사용자의 질문에 대해 Gemini AI 모델이 실시간 스트리밍 방식으로 답변을 생성합니다.
 * 이전 대화 내역을 불러오고, 새로운 메시지를 전송하며, 필요에 따라
 * 음성 합성(TTS) 기능을 통해 답변을 읽어줍니다. 또한 약물 사진 분석 기능을 통해
 * 처방전이나 약봉투 이미지를 분석하여 복약 정보를 자동으로 등록할 수 있습니다.
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

  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const synth = useRef<SpeechSynthesis | null>(null);

  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  const [analyzedMeds, setAnalyzedMeds] = useState<AnalyzedMed[]>([]);

  /**
   * 해당 세션의 과거 대화 내역을 서버로부터 불러옵니다.
   *
   * @async
   * @callback
   */
  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/chat/sessions/${sessionId}`);
      if (!res.ok) throw new Error('세션 로드 실패');
      const result = (await res.json()) as { logs: ChatLog[] };

      const history: Message[] = [];
      if (result.logs.length === 0) {
        history.push({
          role: 'ai',
          content:
            '안녕하세요! Pilly AI 복약 가이드입니다. 약물 복용법이나 주의사항에 대해 무엇이든 물어보세요.',
        });
      } else {
        result.logs.forEach((log) => {
          history.push(
            { role: 'user', content: log.prompt },
            { role: 'ai', content: log.response },
          );
        });
      }
      setMessages(history);
    } catch (err) {
      logger.error({ err }, 'Chat history fetch error');
    } finally {
      setIsInitializing(false);
    }
  }, [sessionId, apiFetch]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
      synth.current = globalThis.speechSynthesis;
      setTtsSupported(true);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /**
   * 음성 안내(TTS) 기능의 사용 여부를 토글합니다.
   */
  const toggleTts = () => {
    if (ttsEnabled) synth.current?.cancel();
    setTtsEnabled(!ttsEnabled);
  };

  /**
   * 주어진 텍스트를 한국어 음성으로 출력합니다.
   *
   * @param text - 음성으로 출력할 텍스트
   */
  const speak = (text: string) => {
    if (!ttsEnabled || !synth.current) return;
    synth.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replaceAll(/[#*`]/g, ''));
    utterance.lang = 'ko-KR';
    synth.current.speak(utterance);
  };

  /**
   * 사용자 메시지를 서버로 전송하고 AI의 답변을 스트리밍 방식으로 수신합니다.
   *
   * @async
   * @param e - 폼 제출 이벤트 객체
   */
  const handleSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const text = input;
    const userMessage: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'ai', content: '' }]);

    try {
      const historyPayload = newMessages.slice(-10).map((msg) => ({
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
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated.at(-1);
            if (last) last.content += chunk;
            return updated;
          });
        }
        if (ttsEnabled) speak(fullResponse);
      }
    } catch (err) {
      logger.error({ err }, 'Chat send error');
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated.at(-1);
        if (last) last.content = '네트워크 연결 상태를 확인해 주세요.';
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 업로드된 사진(처방전 등)을 AI Vision API를 통해 분석 요청합니다.
   *
   * @async
   * @param e - 파일 입력 변경 이벤트 객체
   */
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
        setAnalyzedMeds((result.data as AnalyzedMed[]).map((m) => ({ ...m, checked: true })));
        setIsVisionModalOpen(true);
      }
    } catch (err) {
      logger.error({ err }, 'Image analysis error');
      alert('이미지 분석에 실패했습니다.');
    } finally {
      setIsAnalyzingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * 분석된 약물 목록 중 사용자가 선택한 항목들을 실제 복약 목록에 추가합니다.
   *
   * @async
   */
  const handleVisionConfirm = async () => {
    const medsToAdd = analyzedMeds.filter((m) => m.checked);
    if (medsToAdd.length === 0) return setIsVisionModalOpen(false);

    setIsVisionModalOpen(false);
    setIsLoading(true);
    try {
      for (const med of medsToAdd) {
        await apiFetch('/medications', {
          method: 'POST',
          body: JSON.stringify({
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            startDate: new Date().toISOString(),
          }),
        });
      }
      handleSend({ preventDefault: () => {} } as React.SyntheticEvent);
    } catch (err) {
      logger.error({ err }, 'Vision confirm error');
      alert('약물 추가 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 메시지 내용을 렌더링합니다. AI 답변인 경우 마크다운 형식을 파싱합니다.
   *
   * @param msg - 렌더링할 메시지 객체
   * @returns 렌더링된 메시지 내용
   */
  const renderContent = (msg: Message): React.ReactNode => {
    if (msg.role === 'ai') {
      const html = DOMPurify.sanitize(marked.parse(msg.content) as string);
      return (
        <div
          dangerouslySetInnerHTML={{ __html: html }}
          className="prose prose-sm max-w-none dark:prose-invert"
        />
      );
    }
    return msg.content;
  };

  if (isInitializing) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100dvh-140px)] flex flex-col relative">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
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
              <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                초개인화 모드 ON
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Pilly 초개인화 AI 상담</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ttsSupported && (
            <Button
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
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
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
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
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
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Camera size={18} />
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
              <Send size={18} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
