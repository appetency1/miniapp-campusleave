package com.campusleave.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.domain.entity.SystemConfig;
import com.campusleave.domain.mapper.SystemConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 枚举字典 + 演示模拟定位配置。
 */
@Service
@RequiredArgsConstructor
public class DictService {

    private final SystemConfigMapper configMapper;

    public Map<String, Object> dictionaries() {
        Map<String, Object> data = new HashMap<>();

        data.put("leaveScenes", List.of(
                item("OFF_CAMPUS", "离校请假"),
                item("ON_CAMPUS", "校内请假")));

        data.put("leaveTypes", List.of(
                item("SICK", "病假"),
                item("PERSONAL", "事假"),
                item("OTHER", "其他")));

        data.put("applicationStatus", List.of(
                item("PENDING", "待审批"),
                item("APPROVED", "已通过"),
                item("REJECTED", "已驳回"),
                item("WITHDRAWN", "已撤回"),
                item("CANCELLED", "已取消"),
                item("COMPLETED", "已完成")));

        data.put("materialTypes", List.of(
                item("MEDICAL_PROOF", "诊断证明"),
                item("LEAVE_FORM", "请假单"),
                item("OTHER", "其他")));

        data.put("checkTypes", List.of(
                item("GPS", "定位销假"),
                item("ON_CAMPUS_CONFIRM", "校内确认"),
                item("MANUAL_REVIEW", "人工核验")));

        data.put("reviewStatus", List.of(
                item("NONE", "无"),
                item("PENDING_REVIEW", "待核验"),
                item("APPROVED", "核验通过"),
                item("REJECTED", "核验驳回"),
                item("VOID", "已关闭")));

        data.put("notificationTypes", List.of(
                item("LEAVE_APPROVED", "请假通过"),
                item("LEAVE_REJECTED", "请假驳回"),
                item("EXTENSION_APPROVED", "续假通过"),
                item("EXTENSION_REJECTED", "续假驳回"),
                item("EXTENSION_AUTO_WITHDRAWN", "续假自动撤回"),
                item("START_REMINDER", "开始提醒"),
                item("OVERDUE_REMINDER", "逾期提醒"),
                item("CHECKIN_RESULT", "销假结果"),
                item("SYSTEM", "系统通知")));

        // 模拟定位开关 + 校园中心坐标
        data.put("mockLocation", "true".equalsIgnoreCase(config("MOCK_LOCATION", "false")));
        Map<String, Object> center = new HashMap<>();
        center.put("lat", Double.parseDouble(config("CAMPUS_CENTER_LAT", "30.0")));
        center.put("lng", Double.parseDouble(config("CAMPUS_CENTER_LNG", "120.0")));
        data.put("campusCenter", center);

        return data;
    }

    private String config(String key, String def) {
        SystemConfig c = configMapper.selectOne(
                Wrappers.<SystemConfig>lambdaQuery().eq(SystemConfig::getConfigKey, key));
        return c == null ? def : c.getConfigValue();
    }

    private Map<String, String> item(String value, String label) {
        Map<String, String> m = new HashMap<>();
        m.put("value", value);
        m.put("label", label);
        return m;
    }
}
