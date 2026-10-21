package com.campusleave.storage;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * 本地文件存储。
 *
 * <p><b>为什么不存数据库、不用 OSS</b>（答辩可能问）：
 * 毕设单机部署，文件存本地磁盘 + 静态映射最简单；DB 只存相对 URL，
 * 换域名/迁服务器不用改数据（03 §1.8）。生产环境再换 OSS，接口形状不变。
 *
 * <p><b>安全措施</b>：
 * <ul>
 *   <li>白名单扩展名（jpg/jpeg/png/pdf），不信任客户端 Content-Type</li>
 *   <li>限制 10MB</li>
 *   <li>文件名用 UUID 重写，防路径穿越与重名覆盖（原始文件名单独存 DB）</li>
 *   <li>按 yyyy/MM 分目录，避免单目录文件过多</li>
 * </ul>
 */
@Slf4j
@Service
public class FileStorageService {

    private static final List<String> ALLOWED = List.of("jpg", "jpeg", "png", "pdf");
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    @Value("${campus-leave.upload.dir}")
    private String uploadDir;

    /**
     * 保存文件。
     *
     * @return 相对 URL（如 /files/2026/10/uuid.jpg），DB 只存这个
     */
    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.BAD_PARAM, "文件为空");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BizException(ErrorCode.BAD_PARAM, "文件超过 10MB");
        }

        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = extensionOf(original);
        if (!ALLOWED.contains(ext)) {
            throw new BizException(ErrorCode.BAD_PARAM, "只支持 jpg / png / pdf");
        }

        String month = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String name = UUID.randomUUID().toString().replace("-", "") + "." + ext;

        try {
            Path dir = Paths.get(uploadDir, month).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Path target = dir.resolve(name);
            file.transferTo(target.toFile());
            log.info("file stored: {}", target);
            return "/files/" + month + "/" + name;
        } catch (IOException e) {
            log.error("store file failed", e);
            throw new BizException(ErrorCode.INTERNAL_ERROR, "文件保存失败");
        }
    }

    /** 取扩展名（小写，不含点） */
    private String extensionOf(String filename) {
        int i = filename.lastIndexOf('.');
        if (i < 0 || i == filename.length() - 1) return "";
        return filename.substring(i + 1).toLowerCase(Locale.ROOT);
    }
}
