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
 *
 * <p>对应 03_API §3.4「字典」接口。把系统里所有固定枚举（场景、类型、状态等）
 * 统一在这里返回，前端下拉框 / 状态标签直接取这份字典做映射，
 * 避免前端把「PENDING=待审批」这种对应关系写死（一旦改枚举要改多处）。
 *
 * <p>关于 mockLocation / campusCenter（对应《开发方案 V1.0》D-07）：
 * 由于小程序个人主体无法申请 wx.getLocation 接口权限，毕设演示用「模拟定位」。
 * 后端从 system_config 表读取两个配置项：
 * <ul>
 *   <li>mockLocation：模拟开关（默认 false），true 时前端显示「模拟位置」下拉</li>
 *   <li>campusCenter：校园中心经纬度，用于前端模拟"在校区内/外"两个坐标</li>
 * </ul>
 * 关键设计：模拟的是「坐标来源」，不是「距离算法」——后端 Haversine 距离校验
 * 逻辑完全真实，前端只是把坐标换了个来源。详见 D-07。
 */
@Service
@RequiredArgsConstructor
public class DictService {

    private final SystemConfigMapper configMapper;

    /**
     * 返回全部字典。
     */
    public Map<String, Object> dictionaries() {
        Map<String, Object> data = new HashMap<>();

        // 请假场景：离校 / 校内
        data.put("leaveScenes", List.of(
                item("OFF_CAMPUS", "离校请假"),
                item("ON_CAMPUS", "校内请假")));

        // 请假类型
        data.put("leaveTypes", List.of(
                item("SICK", "病假"),
                item("PERSONAL", "事假"),
                item("OTHER", "其他")));

        // 申请主状态（6 个持久状态，effective_status 由后端按时间计算，不在字典里）
        data.put("applicationStatus", List.of(
                item("PENDING", "待审批"),
                item("APPROVED", "已通过"),
                item("REJECTED", "已驳回"),
                item("WITHDRAWN", "已撤回"),
                item("CANCELLED", "已取消"),
                item("COMPLETED", "已完成")));

        // 材料类型
        data.put("materialTypes", List.of(
                item("MEDICAL_PROOF", "诊断证明"),
                item("LEAVE_FORM", "请假单"),
                item("OTHER", "其他")));

        // 销假 / 核验方式
        data.put("checkTypes", List.of(
                item("GPS", "定位销假"),
                item("ON_CAMPUS_CONFIRM", "校内确认"),
                item("MANUAL_REVIEW", "人工核验")));

        // 人工核验状态
        data.put("reviewStatus", List.of(
                item("NONE", "无"),
                item("PENDING_REVIEW", "待核验"),
                item("APPROVED", "核验通过"),
                item("REJECTED", "核验驳回"),
                item("VOID", "已关闭")));

        // 通知类型
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

        // 模拟定位开关 + 校园中心坐标（演示用，见类注释 D-07）
        data.put("mockLocation", "true".equalsIgnoreCase(config("MOCK_LOCATION", "false")));
        Map<String, Object> center = new HashMap<>();
        center.put("lat", Double.parseDouble(config("CAMPUS_CENTER_LAT", "30.0")));
        center.put("lng", Double.parseDouble(config("CAMPUS_CENTER_LNG", "120.0")));
        data.put("campusCenter", center);

        return data;
    }

    /**
     * 从 system_config 表读一个配置项，取不到时返回默认值。
     */
    private String config(String key, String def) {
        SystemConfig c = configMapper.selectOne(
                Wrappers.<SystemConfig>lambdaQuery().eq(SystemConfig::getConfigKey, key));
        return c == null ? def : c.getConfigValue();
    }

    /**
     * 组装字典项：{value, label}，前端用 value 存库、label 展示。
     */
    private Map<String, String> item(String value, String label) {
        Map<String, String> m = new HashMap<>();
        m.put("value", value);
        m.put("label", label);
        return m;
    }
}
