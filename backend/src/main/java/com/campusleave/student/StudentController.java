package com.campusleave.student;

import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 学生端查询接口（M2 范围：只读）。
 *
 * <p>所有接口都要求 STUDENT 角色 —— 教师/管理员误入小程序会被 403 拦下。
 * 数据范围由 Service 内部按当前登录学生的 student_id 过滤，不相信任何前端传参。
 */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class StudentController {

    private final StudentQueryService queryService;

    /** 首页总览：当前请假 + 最近记录 + 统计（03 §5.1） */
    @GetMapping("/home")
    public Result<Map<String, Object>> home() {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(queryService.home());
    }

    /**
     * 我的申请列表（03 §5.3）。
     *
     * @param filter all / pending / approved / active / closed / overdue（六档筛选）
     */
    @GetMapping("/applications")
    public Result<List<Map<String, Object>>> applications(@RequestParam(required = false) String filter) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(queryService.list(filter));
    }

    /** 申请详情（03 §5.4，含材料 / 销假记录 / 续假 / 可用动作） */
    @GetMapping("/applications/{id}")
    public Result<Map<String, Object>> applicationDetail(@PathVariable Long id) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(queryService.detail(id));
    }

    /** 个人统计（03 §5.13） */
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(queryService.stats());
    }

    /** 消息列表（03 §5.12） */
    @GetMapping("/messages")
    public Result<List<Map<String, Object>>> messages(@RequestParam(required = false) Boolean isRead) {
        CurrentUser.requireRole("STUDENT");
        // isRead 传 false 表示"只看未读"
        Boolean onlyUnread = Boolean.FALSE.equals(isRead) ? Boolean.TRUE : null;
        return Result.ok(queryService.messages(onlyUnread));
    }

    /** 未读数（tab 角标） */
    @GetMapping("/messages/unread-count")
    public Result<Map<String, Object>> unreadCount() {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(Map.of("unread", queryService.unreadCount()));
    }

    /** 标记单条已读 */
    @PostMapping("/messages/{id}/read")
    public Result<Void> markRead(@PathVariable Long id) {
        CurrentUser.requireRole("STUDENT");
        queryService.markRead(id);
        return Result.ok();
    }

    /** 全部已读 */
    @PostMapping("/messages/read-all")
    public Result<Void> markAllRead() {
        CurrentUser.requireRole("STUDENT");
        queryService.markAllRead();
        return Result.ok();
    }
}
