package com.campusleave.student;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 提交请假申请的请求体（03_API §5.2）。
 */
@Data
public class SubmitApplicationRequest {

    @NotBlank(message = "请假场景不能为空")
    private String leaveScene;      // OFF_CAMPUS / ON_CAMPUS

    @NotBlank(message = "请假类型不能为空")
    private String leaveType;       // SICK / PERSONAL / OTHER

    @NotBlank(message = "开始时间不能为空")
    private String startTime;       // yyyy-MM-dd HH:mm:ss

    @NotBlank(message = "结束时间不能为空")
    private String endTime;

    @NotBlank(message = "请假原因不能为空")
    private String reason;

    private String destination;     // 离校去向（建议填，非强制）
    private String contactPhone;    // 请假期间联系电话

    /** 材料（选填，首版全部非必传） */
    private List<MaterialItem> materials;

    @Data
    public static class MaterialItem {
        private String materialType;  // MEDICAL_PROOF / LEAVE_FORM / OTHER
        private String fileName;
        private String fileUrl;
        private Long fileSize;
        private String mimeType;
    }
}
