package com.campusleave;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.campusleave.domain.mapper")
public class CampusLeaveApplication {
    public static void main(String[] args) {
        SpringApplication.run(CampusLeaveApplication.class, args);
    }
}
