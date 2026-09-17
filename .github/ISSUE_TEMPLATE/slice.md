name: 切片工单
description: BE/FE 切片开发工单（P3 开发单元）
labels: []
body:
  - type: textarea
    id: goal
    attributes:
      label: 切片目标
      description: 一句话说明本切片交付什么（出口条件）
      placeholder: 出口 = 可验证的完成标准
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: 验收清单
      description: 逐项可核销的验收条件（每项带可复现命令或行号证据要求）
    validations:
      required: true
  - type: textarea
    id: write-scope
    attributes:
      label: 写面白名单
      description: 允许改动的文件/目录清单（写手边界）
    validations:
      required: true
  - type: textarea
    id: deps
    attributes:
      label: 依赖
      description: 前置切片/Issue 编号
  - type: textarea
    id: evidence
    attributes:
      label: 设计依据
      description: 引用的设计文档节号（data-contract §x.x / prds 文件）
