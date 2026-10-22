package com.campusleave.teacher;

import com.campusleave.common.PageResult;
import com.campusleave.common.Result;
import com.campusleave.domain.entity.ClassInfo;
import com.campusleave.domain.entity.TeacherProfile;
import com.campusleave.domain.mapper.ClassInfoMapper;
import com.campusleave.domain.mapper.UserMapper;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 教师端接口（03_API §6，16 个端点）。
 *
 * <p>与 {@code StudentController} 一样是薄壳：角色门禁 + 参数转发，
 * 数据范围全部在 Service 里按当前教师反查，<b>不信任前端传的任何 id</b>。
 *
 * <p>返回结构对齐 admin/js/mock.js，前端把数据源从 MOCK 换成这些接口即可，
 * 页面渲染代码不需要改。
 */
@RestController
@RequestMapping("/api/v1/teacher")
@RequiredArgsConstructor
public class TeacherController {

    private final TeacherQueryService query;
    private final TeacherCommandService command;
    private final TeacherScopeService scope;
    private final UserMapper userMapper;
    private final ClassInfoMapper classInfoMapper;

    // ---------------- 身份 ----------------

    /** 当前教师 + 负责班级，后台登录后拉一次，用于顶栏和班级筛选 */
    @GetMapping("/profile")
    public Result<Map<String, Object>> profile() {
        CurrentUser.requireRole("TEACHER");
        TeacherProfile tp = scope.currentTeacher();
        var user = userMapper.selectById(CurrentUser.requireUserId());
        var classIds = scope.classIds();
        List<ClassInfo> classes = classIds.isEmpty() ? List.of() : classInfoMapper.selectBatchIds(classIds);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", tp.getId());
        r.put("name", user == null ? "" : user.getRealName());
        r.put("no", tp.getTeacherNo());
        r.put("department", tp.getDepartment());
        r.put("classes", classes.stream().map(ClassInfo::getClassName).collect(Collectors.toList()));
        r.put("classList", classes.stream().map(c -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", c.getId());
            x.put("name", c.getClassName());
            return x;
        }).collect(Collectors.toList()));
        return Result.ok(r);
    }

    // ---------------- 6.1 工作台 ----------------

    @GetMapping("/workbench")
    public Result<Map<String, Object>> workbench() {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.workbench());
    }

    // ---------------- 6.2 申请列表 ----------------

    @GetMapping("/applications")
    public Result<PageResult<Map<String, Object>>> applications(
            @RequestParam(required = false) String tab,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long classId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.applications(tab, status, classId, keyword, startDate, endDate, page, size));
    }

    // ---------------- 6.12 逾期（放在 {id} 之前声明，语义更清晰） ----------------

    @GetMapping("/applications/overdue")
    public Result<PageResult<Map<String, Object>>> overdue(
            @RequestParam(required = false) Long classId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.overdue(classId, page, size));
    }

    // ---------------- 6.3 申请详情 ----------------

    @GetMapping("/applications/{id}")
    public Result<Map<String, Object>> applicationDetail(@PathVariable Long id) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.applicationDetail(id));
    }

    // ---------------- 6.4 / 6.5 审批 ----------------

    @PostMapping("/applications/{id}/approve")
    public Result<Void> approve(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        CurrentUser.requireRole("TEACHER");
        command.approve(id, body == null ? null : body.get("comment"));
        return Result.ok();
    }

    @PostMapping("/applications/{id}/reject")
    public Result<Void> reject(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        CurrentUser.requireRole("TEACHER");
        command.reject(id, body == null ? null : body.get("reason"));
        return Result.ok();
    }

    // ---------------- 6.6 / 6.7 / 6.8 续假 ----------------

    @GetMapping("/extensions")
    public Result<PageResult<Map<String, Object>>> extensions(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.extensions(status, page, size));
    }

    @GetMapping("/extensions/{id}")
    public Result<Map<String, Object>> extensionDetail(@PathVariable Long id) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.extensionDetail(id));
    }

    @PostMapping("/extensions/{id}/approve")
    public Result<Void> approveExtension(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        CurrentUser.requireRole("TEACHER");
        command.approveExtension(id, body == null ? null : body.get("comment"));
        return Result.ok();
    }

    @PostMapping("/extensions/{id}/reject")
    public Result<Void> rejectExtension(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        CurrentUser.requireRole("TEACHER");
        command.rejectExtension(id, body == null ? null : body.get("reason"));
        return Result.ok();
    }

    // ---------------- 6.9 / 6.10 / 6.11 核验 ----------------

    @GetMapping("/checkin-logs")
    public Result<PageResult<Map<String, Object>>> checkinLogs(
            @RequestParam(required = false) String reviewStatus,
            @RequestParam(required = false) String checkResult,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.checkinLogs(reviewStatus, checkResult, page, size));
    }

    @GetMapping("/checkin-logs/{id}")
    public Result<Map<String, Object>> checkinDetail(@PathVariable Long id) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.checkinDetail(id));
    }

    @PostMapping("/checkin-logs/{id}/review")
    public Result<Void> reviewCheckin(@PathVariable Long id, @RequestBody Map<String, String> body) {
        CurrentUser.requireRole("TEACHER");
        command.reviewCheckin(id, body == null ? null : body.get("action"),
                body == null ? null : body.get("comment"));
        return Result.ok();
    }

    // ---------------- 6.13 学生 ----------------

    @GetMapping("/students")
    public Result<PageResult<Map<String, Object>>> students(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long classId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.students(keyword, classId, page, size));
    }

    @GetMapping("/students/{id}")
    public Result<Map<String, Object>> studentDetail(@PathVariable Long id) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.studentDetail(id));
    }

    // ---------------- 6.14 统计 ----------------

    @GetMapping("/stats")
    public Result<Map<String, Object>> stats(@RequestParam(required = false) Long classId) {
        CurrentUser.requireRole("TEACHER");
        return Result.ok(query.stats(classId));
    }
}
