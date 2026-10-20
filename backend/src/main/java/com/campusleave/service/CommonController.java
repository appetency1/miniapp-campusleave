package com.campusleave.service;

import com.campusleave.common.Result;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/common")
@RequiredArgsConstructor
public class CommonController {

    private final DictService dictService;

    @GetMapping("/dictionaries")
    public Result<Map<String, Object>> dictionaries() {
        return Result.ok(dictService.dictionaries());
    }
}
