import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import toStream from 'buffer-to-stream';

/**
 * Cloudinary 파일 업로드 제한 및 설정 상수
 */
const CLOUDINARY_CONFIG = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  DEFAULT_FOLDER: 'pilly_inquiries',
} as const;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Cloudinary 서비스를 통한 파일 업로드 및 삭제를 담당하는 서비스 클래스
 */
export class CloudinaryService {
  /**
   * Web Standard File 객체를 받아 Cloudinary로 스트리밍 업로드합니다.
   *
   * @param file - 업로드할 Web Standard File 객체
   * @param folder - Cloudinary 내 저장될 폴더 경로 (기본값: 'pilly_inquiries')
   * @returns Cloudinary 업로드 응답 결과 (UploadApiResponse)
   * @throws 파일 크기가 5MB를 초과하거나 업로드에 실패할 경우 에러를 던집니다.
   */
  async uploadFile(
    file: File,
    folder: string = CLOUDINARY_CONFIG.DEFAULT_FOLDER,
  ): Promise<UploadApiResponse> {
    if (file.size > CLOUDINARY_CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds ${CLOUDINARY_CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload stream error:', error);
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Cloudinary upload failed: No result returned'));
          }
          resolve(result);
        },
      );
      toStream(buffer).pipe(upload);
    });
  }

  /**
   * Cloudinary의 퍼블릭 ID를 사용하여 업로드된 파일을 삭제합니다.
   *
   * @param publicId - 삭제할 파일의 Cloudinary 퍼블릭 ID
   * @returns 삭제 결과 응답 (성공 시 { result: 'ok' })
   * @throws 삭제 프로세스 중 에러 발생 시 에러를 던집니다.
   */
  async deleteFile(publicId: string): Promise<{ result: string }> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          console.error(`Failed to delete file from Cloudinary (ID: ${publicId}):`, error);
          return reject(error);
        }
        resolve(result);
      });
    });
  }

  /**
   * Cloudinary URL에서 퍼블릭 ID를 추출합니다.
   *
   * @param url - Cloudinary 파일 전체 URL
   * @returns 추출된 퍼블릭 ID 문자열 (추출 불가 시 null)
   */
  extractPublicIdFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const parts = url.split('/');
      const fileNameWithExtension = parts.pop();
      if (!fileNameWithExtension) return null;

      const fileName = fileNameWithExtension.split('.')[0];
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) return fileName;

      const folderPath = parts.slice(uploadIndex + 2).join('/');
      return folderPath ? `${folderPath}/${fileName}` : fileName;
    } catch (err) {
      console.error('Failed to extract publicId from URL:', err);
      return null;
    }
  }
}

/**
 * 싱글톤 인스턴스 익스포트
 */
export const cloudinaryService = new CloudinaryService();
