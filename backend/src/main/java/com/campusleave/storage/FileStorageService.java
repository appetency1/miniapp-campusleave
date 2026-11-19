package com.campusleave.storage;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
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
 *   <li><b>魔数校验</b>：读文件头确认内容真的是图片/PDF —— 扩展名可以随便改，
 *       把 .html 或 .exe 改名成 .jpg 就能绕过纯扩展名白名单</li>
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

        // 扩展名只是声明，内容才是事实：读前 8 字节确认魔数
        String real = detectRealType(file);
        boolean matched = "jpg".equals(real)
                ? ("jpg".equals(ext) || "jpeg".equals(ext))
                : real.equals(ext);
        if (real.isEmpty() || !matched) {
            throw new BizException(ErrorCode.BAD_PARAM,
                    "文件内容与扩展名不符，只支持真实的 jpg / png / pdf");
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

    /**
     * 读文件头判断真实类型（只读 8 字节，不把整个文件载入内存）。
     *
     * @return "jpg" / "png" / "pdf"，认不出返回空串
     */
    private String detectRealType(MultipartFile file) {
        byte[] head = new byte[8];
        int n;
        try (InputStream in = file.getInputStream()) {
            n = in.read(head);
        } catch (IOException e) {
            throw new BizException(ErrorCode.INTERNAL_ERROR, "文件读取失败");
        }
        if (n < 4) {
            return "";
        }
        // JPEG: FF D8 FF
        if ((head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return "jpg";
        }
        // PNG: 89 50 4E 47
        if ((head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G') {
            return "png";
        }
        // PDF: %PDF
        if (head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F') {
            return "pdf";
        }
        return "";
    }

    /** 取扩展名（小写，不含点） */
    private String extensionOf(String filename) {
        int i = filename.lastIndexOf('.');
        if (i < 0 || i == filename.length() - 1) return "";
        return filename.substring(i + 1).toLowerCase(Locale.ROOT);
    }
}
