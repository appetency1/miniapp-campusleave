package com.campusleave.config;

import com.campusleave.common.TraceIdFilter;
import com.campusleave.domain.mapper.UserMapper;
import com.campusleave.security.JwtAuthFilter;
import com.campusleave.security.JwtUtil;
import com.campusleave.storage.FileAccessFilter;
import com.campusleave.storage.FileUrlSigner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WebConfig {

    /**
     * {@code /files/**} 签名校验（P0-3），order=0 最先执行。
     *
     * <p>必须早于 TraceIdFilter 与 JwtAuthFilter：文件路径根本不需要 JWT，
     * 没必要为每次图片请求解析一次 token；被拒的请求也无需建 MDC。
     */
    @Bean
    public FilterRegistrationBean<FileAccessFilter> fileAccessFilter(FileUrlSigner signer) {
        FilterRegistrationBean<FileAccessFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new FileAccessFilter(signer));
        bean.addUrlPatterns("/files/*");
        bean.setOrder(0);
        return bean;
    }

    @Bean
    public FilterRegistrationBean<TraceIdFilter> traceIdFilter() {
        FilterRegistrationBean<TraceIdFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new TraceIdFilter());
        bean.addUrlPatterns("/*");
        bean.setOrder(1);
        return bean;
    }

    /**
     * JWT 鉴权（order=2）。
     *
     * <p>传入 UserMapper 是为了「停用账号立刻失效」：过滤器验签后要查一次库确认
     * status=ACTIVE，否则被停用的人拿旧 token 还能继续用 7 天。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilter(JwtUtil jwtUtil, UserMapper userMapper) {
        FilterRegistrationBean<JwtAuthFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new JwtAuthFilter(jwtUtil, userMapper));
        bean.addUrlPatterns("/api/*");
        bean.setOrder(2);
        return bean;
    }
}
