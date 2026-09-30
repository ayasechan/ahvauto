# ahvauto 条件表达式 EBNF（v1）

实现：`src/lib/expr/`（tokenizer / parser / evaluator / index）。
用例即规格补充：`src/lib/expr/expr.test.ts`（`npm test`）。
本文档是语法的唯一权威来源；`parser.ts` 的实现必须与本文一致，改语法先改本文。

## 1. 词法

```ebnf
number   = digit { digit } [ "." digit { digit } ] ;
string   = '"' { escape | char } '"' ;   (* char = 除 '"' '\' 外的任意字符 *)
escape   = '\"' | '\\' | '\n' | '\t' | '\r' ;  (* 其余转义一律词法错误 *)
ident    = letter { letter | digit } ;   (* letter = A-Z a-z _ *)
boolean  = "true" | "false" ;
```

关键字（不能做变量名）：`and or not true false`。

操作符 token：`== != <= >= < > + - * / % ( ) , .`。空白（空格/Tab/换行）跳过；不支持注释。

## 2. 语法（优先级自上而下递增）

```ebnf
expression     = or_expr ;
or_expr        = and_expr { "or" and_expr } ;
and_expr       = not_expr { "and" not_expr } ;
not_expr       = "not" not_expr | comparison ;
comparison     = additive [ comp_op additive ] ;  (* 禁止链式 a<b<c *)
comp_op        = "==" | "!=" | "<=" | ">=" | "<" | ">" ;
additive       = multiplicative { ("+" | "-") multiplicative } ;
multiplicative = unary { ("*" | "/" | "%") unary } ;
unary          = "-" unary | primary ;
primary        = number | string | boolean
               | func_call | var_path | "(" expression ")" ;
func_call      = ident "(" [ expression { "," expression } ] ")" ;
var_path       = ident { "." ident } ;   (* 点后面必须是 ident；函数调用只能是顶层裸 ident *)
```

刻意收紧的三点：只有单词式 `and/or/not`；比较不可链式；函数调用不允许 `a.b(...)`。

## 3. 求值语义（fail-closed：所有抛错由调用方 try/catch 后按"条件不通过"处理）

- `==`：严格相等，无隐式转换；类型不同直接 `false`；`NaN == NaN` 为 `false`。
- `!=`：`==` 的取反。
- `< <= > >=`：两边必须都是 number，否则抛错；NaN 参与一律 `false`。
- `+ - * / %`：两边必须都是 number，否则抛错；`+` 不做字符串拼接；除零/零取余抛错。
- `and / or`：短路求值；两边必须都是 boolean，否则抛错。
- `not`：操作数必须是 boolean，否则抛错。
- 未知变量 / 未知函数：抛错（不回 `undefined`）。
- **大小写规则（已确定）**：变量名、函数名区分大小写；关键字仅小写有效
  （`AND` 会被当成变量名）；字符串字面量区分大小写。
- **typo 建议（已确定）**：未知名字抛错时附带"你是不是想说"建议。候选池＝变量全路径＋
  函数名＋五个关键字；先找忽略大小写的完全匹配（如 `HP`→`hp`、`AND`→`and`），
  否则取编辑距离最小者，需同时满足`距离≤3`且`2×距离≤两名长度之和`，否则只报未知名字。
  示例：`未知变量 'heal'，你是不是想说变量 'hp'？`
- 函数参数个数/类型：由各函数自己守卫，守卫失败抛错。
- 顶层结果必须是 boolean，否则抛错。

## 4. 明确拒绝的输入（词法/语法错误，报错带列号与换词提示）

| 输入                                  | 处理                                  |
| ------------------------------------- | ------------------------------------- |
| `&&` / `\|\|` / `!`                   | 词法错误，提示换 `and` / `or` / `not` |
| 单个 `=`                              | 词法错误，提示 `==`（已是严格相等）   |
| `===` / `!==`                         | 词法错误，提示 `==` 已是严格相等      |
| 单引号 `'ar'`                         | 词法错误，提示用双引号                |
| 不支持的转义（如 `\q`）、未闭合字符串 | 词法错误                              |
| `1e3`、`0x10`                         | 只支持十进制，解析失败                |
| `a < b < c`                           | 语法错误，提示用 `and` 连接           |
| 多余输入、空表达式、括号不配对        | 语法错误                              |
| 嵌套超过 64 层                        | 语法错误（防恶意配置爆栈）            |

## 5. 示例（变量名以 conditions.ts battleVars 为准）

```
hp < 30 or (mp > 50 and oc >= 50)
turn >= 3 and buff("haste") >= 2
mp < 40 and not isCd(411)
roundType == "ar" and bossAlive > 0
```

## 6. 运行期约定（实现侧，不属于语法）

- 编译结果 `Map` 缓存，上限 500 条（key 为表达式原文）。
- 老格式 `{组号: ["a,op,b"]}` 由 `conditions.ts:groupsToExpr` 翻译成本语法后求值。
- 求值上下文变量见 `conditions.ts:battleVars`；函数（`isCd`、`buffTurn`）见同文件 `evalCtx`。
