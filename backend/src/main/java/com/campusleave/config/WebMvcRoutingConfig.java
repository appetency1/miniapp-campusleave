package com.campusleave.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 让 {@code /admin/} 和 {@code /admin} 直接出页面。
 *
 * <p>Spring Boot 的 welcome page 机制只认根路径的 index.html，
 * 子目录（static/admin/）不会自动兜底到 index.html，
 * 直接访问 /admin/ 会落到 NoResourceFoundException 被包成 500。
 *
 * <p>用 forward 而不是 redirect：URL 保持 /admin/，刷新和分享链接都不会多一层跳转。
 */
@Configuration
public class WebMvcRoutingConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/admin").setViewName("forward:/admin/index.html");
        registry.addViewController("/admin/").setViewName("forward:/admin/index.html");
        registry.addViewController("/admin/index").setViewName("forward:/admin/index.html");
    }
}
