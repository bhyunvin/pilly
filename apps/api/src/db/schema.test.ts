import { describe, expect, it } from 'bun:test';
import { userProfiles } from './schema';
import { getTableConfig } from 'drizzle-orm/pg-core';

describe('Database Schema Integrity Audit', () => {
  it('user_profiles 테이블에 닉네임 중복 방지(UNIQUE) 인덱스가 실제로 정의되어 있는가?', () => {
    // 1. Drizzle-ORM의 도우미를 통해 실제 테이블 설정 추출
    const config = getTableConfig(userProfiles);

    // 2. 인덱스 목록 중 'nickname' 컬럼에 대한 유니크 인덱스가 존재하는지 확인
    const uniqueIdx = config.indexes.find((idx) => {
      const columns = idx.config.columns;
      const isNickname = columns.some((col) => {
        // 타입가드를 통해 안전하게 name 프로퍼티 확인
        return col && typeof col === 'object' && 'name' in col && col.name === 'nickname';
      });
      const isUnique = idx.config.unique === true;
      return isNickname && isUnique;
    });

    expect(uniqueIdx).toBeDefined();
    if (uniqueIdx) {
      expect(uniqueIdx.config.columns).toHaveLength(1);
    }
  });

  it('user_profiles의 userId가 Primary Key로 설정되어 있는가?', () => {
    const config = getTableConfig(userProfiles);

    // Primary Key 컬럼이 userId인지 확인
    const userIdCol = config.columns.find((c) => c.name === 'user_id');
    expect(userIdCol).toBeDefined();
    if (userIdCol) {
      expect(userIdCol.primary).toBe(true);
    }
  });
});
