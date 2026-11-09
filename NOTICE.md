# NOTICE — componentes, fontes e licenças de terceiros

Este arquivo registra a proveniência de material de terceiros assimilado ao ATRIUM.
Ele não substitui `LICENSE` (licença do produto) nem autoriza uso de material
proprietário.

## previdenciar.io — perfil LC 142/2013 de grau constante

- Origem pública: https://github.com/ricarossetto/previdenciar.io
- Commit fixado: `8ec45ec2501418ec62193d053a63f96caa4b05c3` (tag `v0.8.3-beta.1`)
- Licença: MIT (texto integral abaixo)
- O que foi assimilado neste repositório:
  - o **contrato matemático** do perfil `lc142-constant-grade-v1`
    (grau constante, 30/360 inclusivo com união de sobreposições, dias por
    competência, PBC desde 07/1994 até o mês anterior à DIB, correção
    IPC-r/INPC/IGP-DI/INPC-INSS, descarte de 20% com parte inteira,
    carência por competências distintas e RMI de 100% limitada a piso/teto);
  - os **códigos de bloqueio** e a semântica de envelope
    (`blocked` com `data: null` / `experimental` com `native_result`);
  - o **oráculo sintético** de 34 cenários, copiado para
    `tests/fixtures/lc142-rust-oracle.json`, gerado pelo motor Rust do commit
    acima. Os 34 casos são inteiramente fictícios e não contêm dado de segurado.
- O que **não** foi copiado: código Rust, React/TypeScript, shell Tauri, tema,
  assets visuais, esquema de persistência DPAPI, dados de casos privados,
  credenciais e nomes proprietários.
- O port em JavaScript deste repositório é implementação própria, escrita a
  partir do contrato observado e verificada contra o oráculo por diferenciação.

O perfil é **convenção comparativa versionada**, não regra universal de cálculo
previdenciário e não certifica concessão, deficiência, carência jurídica ou
direito adquirido.

### Texto da licença MIT da origem

```
MIT License

Copyright (c) 2026 previdenciar.io contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
