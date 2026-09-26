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
   * 这一组守的是两条会互相打架的诉求：
   * - 应用侧改了角色卡（比如把林知夏重写成另一个人）→ 必须能落到老用户身上；
   * - 用户自己改了角色卡 → 不能被下一次版本更新悄悄改回去。
   * 判据就是 `edited` 这一个标记。
   */
  it('本地存着旧版、且用户没改过时，以 seed 为准刷新', () => {
    const outdated: Persona = {
      ...BUILTIN_PERSONAS[0]!,
      speakingStyle: '这是老版本的一句话',
    }
    const merged = mergePersonas([outdated])

    expect(merged[0]?.speakingStyle).toBe(BUILTIN_PERSONAS[0]?.speakingStyle)
    expect(merged[0]?.speakingStyle).not.toBe('这是老版本的一句话')
  })

  it('用户亲手改过的内置角色以**本地**为准 —— 不能被代码覆盖回去', () => {
    const mine: Persona = {
      ...BUILTIN_PERSONAS[0]!,
      name: '老陈（我自己调的）',
      speakingStyle: '我说的那句才算数',
      edited: true,
    }
    const merged = mergePersonas([mine])
    const builtin = merged.find((persona) => persona.id === BUILTIN_PERSONAS[0]?.id)

    expect(builtin?.name).toBe('老陈（我自己调的）')
    expect(builtin?.speakingStyle).toBe('我说的那句才算数')
    // 仍然是内置角色（不可删除），只是内容归用户
    expect(builtin?.builtin).toBe(true)
  })

  it('改过的角色缺了 seed 后来新增的字段时，用 seed 补上', () => {
    const mine = { ...BUILTIN_PERSONAS[0]!, edited: true } as Record<string, unknown>
    delete mine.taboos

    const merged = mergePersonas([mine as unknown as Persona])
    const builtin = merged.find((persona) => persona.id === BUILTIN_PERSONAS[0]?.id)

    expect(builtin?.taboos).toBe(BUILTIN_PERSONAS[0]?.taboos)
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
