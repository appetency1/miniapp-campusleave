package com.campusleave.student;

/**
 * 地理计算工具（Haversine 公式）。
 *
 * <p><b>为什么用 Haversine 而不是勾股定理</b>（答辩可能问）：
 * 地球是球面，经纬度不是平面直角坐标。纬度 1 度约 111km，但经度 1 度在不同纬度上的
 * 实际距离不同（赤道 111km，北纬 60 度只有 55.5km）。勾股定理直接算会把东西向距离算错，
 * 越往北误差越大。Haversine 考虑球面弧长，误差在米级，足够校园 100 米判定。
 *
 * <p>坐标系约定：小程序 wx.getLocation 传 type='gcj02'，返回的就是 GCJ-02（火星坐标），
 * 后端存的校园中心坐标也必须是 GCJ-02，两边一致才不用转换。混用 WGS-84 会偏 50~500 米。
 */
public final class GeoUtil {

    /** 地球平均半径（米） */
    private static final double EARTH_RADIUS_M = 6371000.0;

    private GeoUtil() {
    }

    /**
     * 两点间球面距离。
     *
     * @return 距离（米）
     */
    public static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double radLat1 = Math.toRadians(lat1);
        double radLat2 = Math.toRadians(lat2);
        double dLat = radLat2 - radLat1;
        double dLng = Math.toRadians(lng2 - lng1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_M * c;
    }

    /**
     * 坐标合法性粗校验：纬度 ±90、经度 ±180，且不能是全 0（常见于定位失败时的兜底值）。
     */
    public static boolean isValid(double lat, double lng) {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        return !(lat == 0 && lng == 0);
    }
}
