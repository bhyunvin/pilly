import nodemailer from 'nodemailer';

// 문자열 URL 대신 객체 방식을 사용하여 SonarJS 린트 에러 해결 및 보안성 향상
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // port 465인 경우 true, 587 등 다른 포트인 경우 false로 설정
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export const sendAccessAlertEmail = async (userEmail: string, sessionId: number) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Mail config missing. Skip sending email.');
    return;
  }

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: userEmail,
    subject: '[Pilly] 관리자의 1:1 문의 연관 채팅방 접근 알림',
    text: `안녕하세요. Pilly 관리자가 귀하의 문의 처리를 위해 연관된 채팅방(ID: ${sessionId}) 대화 내역에 열람을 시작했습니다. 이 권한은 24시간 동안만 유효합니다.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Access alert email sent to ${userEmail} for session ${sessionId}`);
  } catch (error) {
    console.error('Error sending access alert email:', error);
  }
};
