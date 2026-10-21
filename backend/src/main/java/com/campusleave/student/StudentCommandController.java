package com.campusleave.student;

import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 学生端写操作接口（M3）。
 *
 * <p>与 {@link StudentController}（只读）共用一个前缀，路径不冲突。
 * 每个写接口都先做角色门禁，真正的归属校验在 Service 里（学生只能操作自己的申请）。
 */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class StudentCommandController {

    private final StudentCommandService commandService;

    /** 提交申请（03 §5.2） */
    @PostMapping("/applications")
    public Result<Map<String, Object>> submit(@Valid @RequestBody SubmitApplicationRequest req) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(commandService.submit(req));
    }

    /** 撤回（03 §5.5，仅待审批） */
    @PostMapping("/applications/{id}/withdraw")
    public Result<Void> withdraw(@PathVariable Long id, @RequestBody(required = false) ReasonBody body) {
        CurrentUser.requireRole("STUDENT");
        commandService.withdraw(id, body == null ? null : body.getReason());
        return Result.ok();
    }

    /** 取消（03 §5.6，仅已通过未开始） */
    @PostMapping("/applications/{id}/cancel")
    public Result<Void> cancel(@PathVariable Long id, @RequestBody(required = false) ReasonBody body) {
        CurrentUser.requireRole("STUDENT");
        commandService.cancel(id, body == null ? null : body.getReason());
        return Result.ok();
    }

    /** 校内确认结束（03 §5.7） */
    @PostMapping("/applications/{id}/checkin/on-campus")
    public Result<Map<String, Object>> checkinOnCampus(@PathVariable Long id) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(commandService.checkinOnCampus(id));
    }

    /** 离校 GPS 销假（03 §5.8） */
    @PostMapping("/applications/{id}/checkin/gps")
    public Result<Map<String, Object>> checkinGps(@PathVariable Long id,
                                                  @RequestBody GpsBody body) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(commandService.checkinGps(id, body.getLatitude(), body.getLongitude(),
                body.getAccuracy()));
    }

    /** 申请人工核验（03 §5.9） */
    @PostMapping("/applications/{id}/checkin/manual-review")
    public Result<Map<String, Object>> manualReview(@PathVariable Long id,
                                                    @RequestBody(required = false) ReviewBody body) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(commandService.applyManualReview(id,
                body == null ? null : body.getReason(),
                body == null ? null : body.getEvidenceUrl()));
    }

    /** 申请续假（03 §5.10） */
    @PostMapping("/applications/{id}/extensions")
    public Result<Map<String, Object>> extension(@PathVariable Long id,
                                                 @RequestBody ExtensionBody body) {
        CurrentUser.requireRole("STUDENT");
        return Result.ok(commandService.applyExtension(id, body.getRequestedEndTime(), body.getReason()));
    }

    /** 撤回续假（03 §5.11） */
    @PostMapping("/extensions/{id}/withdraw")
    public Result<Void> withdrawExtension(@PathVariable Long id,
                                          @RequestBody(required = false) ReasonBody body) {
        CurrentUser.requireRole("STUDENT");
        commandService.withdrawExtension(id, body == null ? null : body.getReason());
        return Result.ok();
    }

    // ---------------- 请求体 ----------------

    @Data
    public static class ReasonBody {
        private String reason;
    }

    @Data
    public static class GpsBody {
        private Double latitude;
        private Double longitude;
        private Double accuracy;
    }

    @Data
    public static class ReviewBody {
        private String reason;
        private String evidenceUrl;
    }

    @Data
    public static class ExtensionBody {
        private String requestedEndTime;
        private String reason;
    }
}
