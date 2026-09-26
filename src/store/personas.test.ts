import { describe, expect, it } from 'vitest'

import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import { mergePersonas } from '@/store/personas'
import type { Persona } from '@/types/models'

const CUSTOM: Persona = {
  id: 'custom-1',
  name: '我的角色',
  avatar: 'quill',
  identity: '我自己调的',
  personality: '随和',
  speakingStyle: '一句话说完',
  teachingStrategy: '先讲结论',
  taboos: '',
  builtin: false,
  createdAt: '2026-09-01T00:00:00.000Z',
}

describe('mergePersonas', () => {
  it('空数据时就是内置角色', () => {
    expect(mergePersonas(undefined)).toEqual(BUILTIN_PERSONAS)
  })

  /*
   * 这条是真实需求：内置角色的说话风格（一次说多少）改过一版，
   * 但老用户本地存着的是旧副本，读本地那份等于改动白做。
   * 内置角色受保护、用户改不了，所以本地那份没有任何用户数据，应当以 seed 为准。
   */
  it('本地存着旧版内置角色时，以 seed 为准刷新', () => {
    const outdated: Persona = {
      ...BUILTIN_PERSONAS[0]!,
      speakingStyle: '这是老版本的一句话',
    }
    const merged = mergePersonas([outdated])

    expect(merged[0]?.speakingStyle).toBe(BUILTIN_PERSONAS[0]?.speakingStyle)
    expect(merged[0]?.speakingStyle).not.toBe('这是老版本的一句话')
  })

  it('自定义角色原样保留，并且排在内置角色之后', () => {
    const merged = mergePersonas([...BUILTIN_PERSONAS, CUSTOM])

    expect(merged).toHaveLength(BUILTIN_PERSONAS.length + 1)
    expect(merged.filter((persona) => persona.builtin)).toHaveLength(BUILTIN_PERSONAS.length)
    expect(merged[merged.length - 1]).toEqual(CUSTOM)
  })

  it('内置角色的副本（builtin: false）不会被当成内置角色丢掉', () => {
    const copy: Persona = { ...BUILTIN_PERSONAS[1]!, id: 'copy-1', builtin: false }
    const merged = mergePersonas([copy])

    expect(merged.some((persona) => persona.id === 'copy-1')).toBe(true)
  })
})
