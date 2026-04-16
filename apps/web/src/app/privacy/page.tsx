import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12 prose dark:prose-invert">
      <h1 className="text-3xl font-bold mb-8">개인정보 및 민감정보 처리방침</h1>

      <p className="mb-6">
        'Pilly'는 정보주체의 개인정보를 보호하고 관련 법령을 준수하기 위해 다음과 같은 처리방침을
        수립·공개합니다.
      </p>

      <section className="mb-8 border-l-4 border-primary pl-4 py-2 bg-muted/20">
        <h2 className="text-xl font-semibold mb-4">1. 수집하는 민감정보 항목 (필수 동의)</h2>
        <p>본 서비스는 개인정보보호법 제23조에 따라 다음과 같은 건강 관련 민감정보를 수집합니다.</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>수집 항목:</strong> 복용 중인 약물 목록, 복약 기록(일시, 상태), 처방전 이미지
            내의 약물 정보, AI와의 상담 내역
          </li>
          <li>
            <strong>수집 목적:</strong> 초개인화된 복약 상담 제공, 복약 관리 및 알림 서비스 제공
          </li>
          <li>
            <strong>보유 기간:</strong> 회원 탈퇴 시 즉시 파기
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. 개인정보의 제3자 제공</h2>
        <p>
          회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 이용자가
          동의하거나 법령의 규정에 의거한 경우에는 예외로 합니다. (본 서비스의 AI 엔진 제공사인
          Google Gemini API에는 익명화된 텍스트 데이터만 전달됩니다.)
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. 개인정보의 파기</h2>
        <p>
          이용자가 회원 탈퇴를 요청하거나 수집 목적이 달성된 경우, 회사는 해당 정보를 즉시 복구
          불가능한 방법으로 파기합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. 정보주체의 권리</h2>
        <p>
          이용자는 언제든지 자신의 개인정보를 조회, 수정하거나 삭제 요청을 할 수 있으며, 민감정보
          처리에 대한 동의를 철회할 수 있습니다.
        </p>
      </section>

      <p className="text-sm text-gray-500 mt-12">시행일자: 2026년 4월 9일</p>
    </div>
  );
}
