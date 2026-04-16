import React from 'react';

/**
 * 서비스 이용약관 페이지 컴포넌트입니다.
 * 서비스의 목적, 의료 정보 제공의 한계, 이용자의 의무 등 법적 고지 사항을 안내합니다.
 *
 * @returns {JSX.Element} 이용약관 페이지 렌더링 결과
 */
export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12 prose dark:prose-invert">
      <h1 className="text-3xl font-bold mb-8">서비스 이용약관</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">제 1 조 (목적)</h2>
        <p>
          본 약관은 'Pilly'(이하 "회사"라 함)가 제공하는 AI 복약 가이드 서비스 및 관련 제반 서비스의
          이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을
          목적으로 합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">제 2 조 (의료 정보 제공의 한계 및 면책)</h2>
        <ol className="list-decimal pl-5">
          <li className="mb-2">
            <strong>
              본 서비스가 제공하는 모든 정보(AI 답변 포함)는 참고용이며, 어떠한 경우에도 의사의
              진단이나 약사의 처방을 대신할 수 없습니다.
            </strong>
          </li>
          <li className="mb-2">
            사용자는 본 서비스의 정보를 신뢰하기 전 반드시 전문 의료인과 상담해야 합니다. 회사는 본
            서비스의 정보를 이용함에 따라 발생하는 직접적, 간접적 손해에 대해 책임을 지지 않습니다.
          </li>
          <li className="mb-2">
            AI 모델(Gemini 등)의 특성상 답변에 오류가 있을 수 있으며, 회사는 정보의 정확성, 완전성,
            시의성을 보장하지 않습니다.
          </li>
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">제 3 조 (이용자의 의무)</h2>
        <p>
          이용자는 처방전 사진 등을 업로드할 때 본인의 성명, 주민등록번호 등 민감한 개인식별정보를
          반드시 가린 후 업로드해야 하며, 이를 이행하지 않아 발생하는 정보 유출 사고의 책임은 이용자
          본인에게 있습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">제 4 조 (관할 법원)</h2>
        <p>
          서비스 이용과 관련하여 발생한 분쟁에 대해서는 회사의 본사 소재지를 관할하는 법원을 전용
          관할 법원으로 합니다.
        </p>
      </section>

      <p className="text-sm text-gray-500 mt-12">시행일자: 2026년 4월 9일</p>
    </div>
  );
}
