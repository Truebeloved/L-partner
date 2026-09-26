import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CourseFormDialog } from '@/features/course/components/CourseFormDialog'
import type { CoursePlanDraft } from '@/features/course/drafts'

// 每个用例挂载一个弹窗，不清理的话第二个用例会同时看到两个「保存课程」按钮
afterEach(() => {
  cleanup()
})

/**
 * 表单不编辑讲义与链接，但**必须原样把它们带走**。
 *
 * 这条用例守的是一个已经发生过两次的 bug 类：表单只认"标题 / 知识点 / 时长"，
 * 用户点一次保存，视频链接（第一次）和课程自带的讲义（第二次）就被清空了。
 * 断言的是"保存后草稿里还在"，而不是表单内部怎么存 —— 内部重构不该弄坏它。
 */
const draftWithAttachments: CoursePlanDraft = {
  title: '文言文阅读 · 中高考贯通',
  goal: '读懂浅易文言文',
  weeklyMinutes: 300,
  stages: [
    {
      title: '篇目精读',
      objective: '读懂一篇陌生的文言文',
      units: [
        {
          title: '《劝学》（荀子）· 比喻论证怎么把道理说透',
          knowledgePoints: ['比喻论证', '论证层次'],
          estimatedMinutes: 90,
          resourceUrl: 'https://www.bilibili.com/video/BV1eAnJzyEuE?p=1',
          resourceLabel: 'B 站原视频 · 劝学',
          content: '**原文**\n\n> 君子曰：学不可以已。\n\n**这一篇考什么**：比喻论证的作用。',
        },
      ],
    },
  ],
}

describe('CourseFormDialog', () => {
  it('保存时把讲义与视频链接原样带走', async () => {
    const onSubmit = vi.fn()
    render(
      <CourseFormDialog initialDraft={draftWithAttachments} onCancel={() => {}} onSubmit={onSubmit} />,
    )

    await userEvent.click(screen.getByRole('button', { name: '保存课程' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const saved = onSubmit.mock.calls[0]![0] as CoursePlanDraft
    const unit = saved.stages[0]!.units[0]!

    expect(unit.content).toBe(draftWithAttachments.stages[0]!.units[0]!.content)
    expect(unit.resourceUrl).toBe('https://www.bilibili.com/video/BV1eAnJzyEuE?p=1')
    expect(unit.resourceLabel).toBe('B 站原视频 · 劝学')
    expect(unit.estimatedMinutes).toBe(90)
  })

  it('用户改了标题，讲义也不会因此消失', async () => {
    const onSubmit = vi.fn()
    render(
      <CourseFormDialog initialDraft={draftWithAttachments} onCancel={() => {}} onSubmit={onSubmit} />,
    )

    const title = screen.getByLabelText('课程标题')
    await userEvent.clear(title)
    await userEvent.type(title, '文言文（改过标题）')
    await userEvent.click(screen.getByRole('button', { name: '保存课程' }))

    const saved = onSubmit.mock.calls[0]![0] as CoursePlanDraft
    expect(saved.title).toBe('文言文（改过标题）')
    expect(saved.stages[0]!.units[0]!.content).toBeTruthy()
  })
})
