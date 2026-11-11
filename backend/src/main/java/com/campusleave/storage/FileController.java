package com.campusleave.storage;

import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 文件上传（03_API §4）。
 *
 * <p>上传只负责把文件落盘并返回相对 URL；材料的业务归属在提交申请时写入
 * leave_material（那样才能和申请绑定）。
 */
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService storageService;

    @PostMapping
    public Result<Map<String, Object>> upload(@RequestParam("file") MultipartFile file,
                                              @RequestParam(required = false) String bizType) {
        CurrentUser.require();   // 只要登录即可
        String url = storageService.store(file);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("fileName", file.getOriginalFilename());
        // 刻意返回「不带签名」的纯存储路径：小程序会把它原样塞回 materials 提交入库
        // （apply.js -> StudentCommandService.setFileUrl），落库的必须是永久标识。
        // 带时效的 exp/sig 只出现在详情读取接口（StudentQueryService / TeacherQueryService）。
        data.put("fileUrl", url);
        data.put("fileSize", file.getSize());
        data.put("mimeType", file.getContentType());
        data.put("bizType", bizType == null ? "MATERIAL" : bizType);
        return Result.ok(data);
    }
}
