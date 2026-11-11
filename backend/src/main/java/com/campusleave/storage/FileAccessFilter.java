package com.campusleave.storage;

import com.campusleave.common.ErrorCode;
import com.campusleave.common.TraceIdFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * {@code /files/**} 访问校验（P0-3）。
 *
 * <p>只放行带合法签名（{@code ?exp=...&sig=...}）的请求，其余一律 403。
 * 签名由 {@link FileUrlSigner} 在业务层出 URL 时生成，前端不需要改动——
 * {@code <img src>}、{@code <a href>} 直接带查询串访问即可。
 *
 * <p><b>为什么返回 JSON 而不是 HTML 错误页</b>：这个路径既可能被前端 fetch，
 * 也可能被浏览器直接打开。统一给 {@code {"code":40301,...}} 与项目其它接口同构，
 * 前端若用 fetch 取文件时能按 code 判断，不会因为拿到一段 HTML 而解析失败。
 *
 * <p><b>注册顺序</b>：在 {@code WebConfig} 里 order=0（早于 TraceIdFilter），
 * 这样被拒的请求连 MDC 都不用建。这里仍然自己读一次 traceId 兜底填进响应体。
 */
public class FileAccessFilter extends OncePerRequestFilter {

    /** 查询参数名：过期时间（unix 秒） */
    private static final String PARAM_EXP = "exp";

    /** 查询参数名：签名 */
    private static final String PARAM_SIG = "sig";

    private final FileUrlSigner signer;

    public FileAccessFilter(FileUrlSigner signer) {
        this.signer = signer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String exp = request.getParameter(PARAM_EXP);
        String sig = request.getParameter(PARAM_SIG);

        if (signer.verify(path, exp, sig)) {
            chain.doFilter(request, response);
            return;
        }

        // 验签失败 / 过期 / 没带签名：一律 403，且不透露是「签名错」还是「过期」
        response.setStatus(ErrorCode.FORBIDDEN.getHttpStatus().value());
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String traceId = TraceIdFilter.getTraceId();
        String body = "{\"code\":" + ErrorCode.FORBIDDEN.getCode()
                + ",\"message\":\"文件链接无效或已过期\",\"data\":null"
                + ",\"traceId\":\"" + traceId + "\"}";
        response.getWriter().write(body);
    }
}
