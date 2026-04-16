import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-background mt-auto py-6">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground space-y-4 md:space-y-0">
        <div className="flex flex-col items-center md:items-start">
          <p className="font-semibold text-foreground">© 2026 Pilly Team. All rights reserved.</p>
          <p className="mt-1">Pilly는 전문 의료 정보가 아닌 AI 가이드를 제공합니다.</p>
        </div>
        <div className="flex gap-6">
          <Link
            href="/terms"
            className="hover:text-primary transition-colors underline-offset-4 hover:underline"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="hover:text-primary transition-colors underline-offset-4 hover:underline"
          >
            개인정보처리방침
          </Link>
        </div>
      </div>
    </footer>
  );
}
