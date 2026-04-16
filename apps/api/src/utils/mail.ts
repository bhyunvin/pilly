import nodemailer from 'nodemailer';

// 문자열 URL 대신 객체 방식을 사용하여 SonarJS 린트 에러 해결 및 보안성 향상
/**
 * 이메일 발송을 위한 Nodemailer 전송 객체입니다.
 * Gmail SMTP 서버를 사용하여 보안 연결(SSL)을 통해 메일을 전송합니다.
 */
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // port 465인 경우 true, 587 등 다른 포트인 경우 false로 설정
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * 관리자가 사용자의 채팅방에 접근했음을 알리는 이메일을 발송합니다.
 *
 * @description
 * 1:1 문의 처리를 위해 관리자가 관련 채팅 내역을 열람하기 시작할 때 사용자에게 알림을 보냅니다.
 * 이 기능은 투명한 관리 정책을 유지하고 사용자의 프라이버시를 보호하기 위한 목적으로 사용됩니다.
 *
 * @async
 * @param {string} userEmail - 알림을 받을 사용자의 이메일 주소
 * @param {number} sessionId - 관리자가 접근한 채팅 세션의 ID
 * @returns {Promise<void>}
 */
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
