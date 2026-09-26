import { createCourse } from '@/features/course/courseActions'
import { SEED_COURSES } from '@/lib/seed/courses'
import { normalizeForMatch } from '@/features/today/autoTodo'
import { useCourseStore } from '@/store/courses'

/**
 * 把随应用交付的示例课程摆上书架。
 *
 * 为什么要**自动**摆上（而不是让用户在弹窗里挑）：
 * 上一版把它们藏在「新建课程」弹出的选择框里，于是全新安装打开应用看到的是一个空书架 ——
 * 用户的原话是「示例课程是初始就在书架上的」。示例课程存在的全部意义就是
 * "零配置也能立刻看到这个应用在干什么"，需要用户先做一个选择才能看到，这个意义就废了一半。
 *
 * 两条边界：
 * - **只自动载入一次**（靠 course store 的 seededAt）。用户删光了课程就是删光了，
 *   下次启动不该被他没要求的东西填满；想恢复可以去「设置 → 示例课程」手动载入。
 * - **按标题去重**。手动载入（force）时只补缺的那些，不会把同一门课摆成两本。
 */
export function installSeedCourses(options: { force?: boolean } = {}): number {
  const store = useCourseStore.getState()
  // 已经自动载入过就不再动它 —— 自动载入是"第一次打开"，不是"每次打开"
  if (!options.force && store.seededAt) return 0

  const existing = new Set(store.courses.map((course) => normalizeForMatch(course.title)))
  let installed = 0

  for (const seed of SEED_COURSES) {
    if (existing.has(normalizeForMatch(seed.title))) continue
    // build() 每次返回新对象：载入后用户会编辑它，共享同一个对象会让下次载入带着上次的修改
    createCourse({ ...seed.build(), source: 'manual' })
    installed += 1
  }

  // 即使一门都没装（标题都在了）也要落标记：否则每次启动都会再扫一遍，
  // 而且用户把示例课程删掉之后又会被重新塞回来
  useCourseStore.getState().markSeeded()
  return installed
}
