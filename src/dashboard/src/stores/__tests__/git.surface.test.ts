/**
 * git 스토어 분할이 공개 표면을 바꾸지 않았음을 보증한다.
 *
 * 이 파일은 **다른 테스트와 같은 파일에 두지 않는다.** Vitest 는 파일 단위로
 * 모듈을 격리하므로, 스토어를 변경하는 테스트와 한 파일에 있으면 초기 상태가
 * 아니라 변경된 상태를 스냅샷하게 된다.
 */
import { describe, expect, it } from 'vitest'
import { useGitStore } from '../git'
import baseline from './git.surface.json'
import { surface } from './storeSurface'

describe('git 스토어 표면', () => {
  it('상태 키·액션 이름·초기값이 분할 전과 같다', () => {
    expect(surface(useGitStore.getState() as Record<string, unknown>)).toEqual(baseline)
  })
})
