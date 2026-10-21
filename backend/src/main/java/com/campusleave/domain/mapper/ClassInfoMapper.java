package com.campusleave.domain.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campusleave.domain.entity.ClassInfo;
import org.apache.ibatis.annotations.Mapper;

/**
 * ClassInfo 表 Mapper。
 * 继承 BaseMapper 即获得单表 CRUD（selectById / selectList / insert / updateById 等），
 * 复杂查询写在同名 XML 或本接口的 @Select 上。
 */
@Mapper
public interface ClassInfoMapper extends BaseMapper<ClassInfo> {
}
