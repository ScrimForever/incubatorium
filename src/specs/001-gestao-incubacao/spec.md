# Feature Specification: Gestão de Incubação (Cadastro, Plano de Negócio e Avaliações)

**Feature Branch**: `001-gestao-incubacao`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Essa aplicação deve atender a usuários que vão se cadastrar em uma incubadora e aos colaboradores da incubadora e consultores que irão avaliar cada incubado. Existindo metas e planos de negócio."

## Clarifications

### Session 2026-09-30

- Q: Qual a escala da nota de avaliação? → A: 1 a 5. Sem avaliação, a etapa fica com `valor` nulo.
- Q: Quem cadastra consultores e colaboradores? → A: Uma conta admin. Os endpoints de administração de contas ficam adiados para uma entrega futura; por ora a equipe é criada por script de implantação.
- Q: Como se relaciona o plano de negócio com o questionário? → A: O questionário é o plano de negócio.
- Q: O que cada avaliação do consultor avalia: o incubado como um todo ou cada parte? → A: A nota (1 a 5) é dada por etapa do questionário; o questionário tem várias etapas, e elas podem ser alteradas conforme os documentos da incubadora.
- Q: Como os anexos entram no plano? → A: Só pelo endpoint de arquivos (multipart form); os arquivos ficam em disco por etapa e o servidor não grava referências no JSON do questionário.
- Q: Onde fica a nota de cada etapa? → A: Dentro do próprio questionário (`json_questionario[etapa].nota`, como o frontend já grava), sem tabela de avaliações e sem histórico; uma nova avaliação da etapa substitui a anterior.
- Q: Quem pode alterar as etapas do questionário quando os documentos da incubadora mudarem? → A: Ninguém pela aplicação; as etapas são alteradas apenas no código do sistema, por programação.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Candidato se cadastra na incubadora (Priority: P1)

Uma pessoa empreendedora cria sua conta, preenche o questionário (que é o seu plano de negócio) e o mantém atualizado. O fluxo de pedido de ingresso (envio, aprovação e rejeição por um colaborador) foi removido do sistema.

**Why this priority**: Sem incubados cadastrados e aprovados, nenhuma outra funcionalidade (plano, avaliações) tem utilidade. É o menor fluxo que entrega valor.

**Independent Test**: Cadastrar um candidato, salvar o questionário e conferir que as respostas são devolvidas.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem conta, **When** ela se cadastra com dados válidos e salva o questionário, **Then** as respostas ficam gravadas.
2. **Given** um e-mail já cadastrado, **When** alguém tenta se cadastrar com ele, **Then** o sistema impede o cadastro duplicado e informa o motivo.

---

### User Story 2 - Incubado mantém o plano de negócio (questionário) (Priority: P2)

O incubado aprovado mantém o seu plano de negócio, que é o questionário respondido: pode revisar as respostas e anexar documentos às etapas. As notas e pareceres dados pelos consultores não são alterados quando ele edita as respostas.

**Why this priority**: O plano de negócio é o objeto central do acompanhamento e da avaliação, e precisa continuar atualizável depois da aprovação.

**Independent Test**: Como incubado aprovado, revisar o questionário, anexar um documento e conferir que as notas já dadas continuam intactas.

**Acceptance Scenarios**:

1. **Given** um incubado aprovado, **When** ele revisa e salva as respostas do questionário, **Then** o plano vigente é atualizado com data e autor da alteração e o status continua aprovado.
2. **Given** um incubado com etapas já avaliadas, **When** ele salva as respostas, **Then** as notas e pareceres dos consultores permanecem como estavam.
3. **Given** um incubado, **When** ele anexa um arquivo de tipo, conteúdo ou tamanho não permitido, **Then** o envio é recusado com o motivo.
4. **Given** um incubado com o questionário em edição, **When** ele envia um arquivo pelo endpoint de arquivos, **Then** o arquivo é gravado e o questionário passa a referenciar o seu caminho na etapa.
5. **Given** um arquivo já referenciado no questionário, **When** o incubado o remove pelo endpoint de arquivos, **Then** o arquivo e a referência desaparecem do questionário.

---

### User Story 3 - Consultor avalia o incubado (Priority: P3)

Um consultor revisa seu plano de negócio e avalia cada etapa do questionário (plano de negócio), dando a cada etapa uma nota de 1 a 5 e um parecer. O incubado vê as avaliações recebidas.

**Why this priority**: A avaliação é o principal retorno de valor da incubadora ao incubado, mas depende do plano de negócio já respondido.

**Independent Test**: Como consultor, registrar uma avaliação de um incubado ativo com plano respondido e verificar que o incubado a visualiza e que um incubado ou outro perfil sem permissão não consegue avaliar.

**Acceptance Scenarios**:

1. **Given** um consultor autenticado e um incubado ativo, **When** ele registra a avaliação de uma etapa do questionário com nota e parecer, **Then** a avaliação fica gravada na própria etapa do questionário, com avaliador e data, e visível ao incubado e aos colaboradores; avaliar de novo a mesma etapa substitui a avaliação anterior.
2. **Given** um usuário que não é consultor (incubado, por exemplo), **When** ele tenta avaliar um incubado, **Then** o acesso é negado.
3. **Given** um incubado com etapas avaliadas, **When** ele consulta suas avaliações, **Then** vê, por etapa, a nota, o parecer, o avaliador e a data.
4. **Given** um incubado que edita o questionário, **When** ele salva as respostas, **Then** as notas e pareceres já dados pelos consultores não são alterados.

---

### User Story 4 - Colaborador administra a incubadora (Priority: P4)

O colaborador da incubadora acompanha o conjunto de incubados e visualiza uma visão consolidada de situação e avaliações.

**Why this priority**: Dá visão de gestão e controle, mas as funções essenciais já funcionam sem ela.

**Independent Test**: Como colaborador, consultar o painel com a situação e a data da última avaliação.

**Acceptance Scenarios**:

1. **Given** vários incubados, **When** o colaborador abre a visão geral, **Then** vê por incubado: situação, estado do plano e data da última avaliação.
2. **Given** um incubado que concluiu o programa ou desistiu, **When** o colaborador altera sua situação, **Then** o incubado deixa de ser ativo e seus dados históricos são preservados.

---

### Edge Cases

- Incubado tenta acessar dados de outro incubado.
- Remoção de consultor que possui avaliações registradas: as avaliações são preservadas.
- Etapa do questionário alterada ou removida depois de já ter sido respondida ou avaliada: as respostas e notas anteriores são preservadas.
- Envio de anexos (ex.: documentos do plano) em formato ou tamanho não permitido.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um candidato crie uma conta e grave o questionário com os dados do negócio.
- **FR-002**: O sistema MUST impedir contas duplicadas pelo mesmo e-mail.
- **FR-003**: O sistema MUST oferecer quatro perfis de acesso distintos: incubado, consultor, colaborador da incubadora e admin.
- **FR-005**: O plano de negócio MUST ser o questionário do incubado; o incubado MUST poder revisá-lo.
- **FR-010**: Consultores MUST poder avaliar incubados ativos, avaliando cada etapa do questionário com nota inteira de 1 a 5 e parecer.
- **FR-010a**: O questionário MUST ser composto por várias etapas. Nenhum perfil (inclusive admin) altera as etapas pela aplicação; a estrutura do JSON é do frontend e mudanças nela MUST preservar respostas e avaliações já registradas.
- **FR-011**: A avaliação de cada etapa MUST registrar nota, parecer, avaliador e data na própria etapa do questionário e MUST ser visível ao incubado avaliado e aos colaboradores.
- **FR-012**: O sistema MUST restringir cada incubado ao acesso dos próprios dados; colaboradores MUST ter visão de todos os incubados.
- **FR-013**: Colaboradores MUST poder alterar a situação de um incubado (ativo, concluído, desistente) preservando seu histórico.
- **FR-014**: O sistema MUST oferecer aos colaboradores uma visão consolidada por incubado com situação, estado do plano e última avaliação.
- **FR-015**: O sistema MUST validar tipo, conteúdo e tamanho dos arquivos anexados ao plano de negócio.
- **FR-015a**: Os anexos MUST ser enviados e removidos pelo endpoint de arquivos (multipart form), só com o questionário em estado editável (`iniciado`, `pendente` ou `aprovado`).
- **FR-016**: O sistema MUST notificar o incubado por e-mail quando receber uma nova avaliação.

### Key Entities *(include if feature involves data)*

- **Usuário**: pessoa com conta; possui um perfil (incubado, consultor, colaborador ou admin).
- **Incubado**: o próprio usuário cadastrado (perfil incubado) com situação (ativo, concluído, desistente). Não há cadastro separado do candidato.
- **Plano de negócio**: o questionário respondido do incubado (um único questionário vigente por usuário), com anexos opcionais.
- **Etapa do questionário**: parte do questionário (plano de negócio) definida pelo sistema; o conjunto de etapas muda apenas por atualização do sistema, conforme documentos da incubadora.
- **Avaliação**: nota (1 a 5), parecer, avaliador e data de um consultor sobre uma etapa do questionário; fica dentro do próprio questionário.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um candidato conclui cadastro e preenchimento do questionário em menos de 10 minutos.
- **SC-002**: Um incubado revisa e salva o seu plano de negócio em menos de 15 minutos.
- **SC-003**: Um consultor registra uma avaliação completa de um incubado em menos de 10 minutos.
- **SC-004**: 100% das tentativas de acessar dados de incubados não autorizados (outro incubado) são negadas.
- **SC-005**: Colaboradores localizam a situação e a última avaliação de qualquer incubado em menos de 1 minuto pela visão consolidada.
- **SC-006**: 90% dos usuários concluem sua tarefa principal (cadastro, revisão do plano ou avaliação) na primeira tentativa, sem ajuda.

## Assumptions

- A incubadora é única (uma só organização); múltiplas incubadoras ficam fora do escopo.
- A administração de contas pela aplicação (admin criar equipe, atribuir perfil, desativar contas) está adiada; por ora admin, colaboradores e consultores são criados por script de implantação.
- O e-mail é o identificador de acesso e o canal de notificação.
- Qualquer consultor lê e avalia qualquer etapa de um incubado ativo; não há vínculo entre consultor e incubado.
- Cada incubado corresponde a um único negócio e possui um único plano de negócio ativo.
- A nota de cada etapa avaliável (2 a 9; a etapa 1 não tem nota) é um número inteiro de 1 a 5, acompanhado de parecer textual; não há nota geral única.
- O sistema reutiliza a autenticação de usuários e o envio de e-mail já existentes, e o módulo de questionários existente é o plano de negócio.
- Aplicativo móvel nativo, pagamentos e integrações com sistemas externos estão fora do escopo.

### Exceções de autenticação

Todas as rotas que alteram dados exigem usuário autenticado, exceto as abaixo, que existem
justamente para quem ainda não tem sessão:

- `POST /auth/register`: o candidato cria a conta (sempre com perfil incubado, conta inativa).
- `POST /auth/jwt/login`: obtém o token de acesso.
- `POST /auth/forgot-password` e `POST /auth/reset-password`: redefinição de senha por token
  enviado ao e-mail da conta.
- `POST /auth/request-verify-token` e `POST /auth/verify`: verificação de e-mail (fastapi-users).
- `GET /validar_email/{email}/{code}`: ativa a conta com o código de 6 dígitos recebido por e-mail
  (o código é o segredo; a rota não concede acesso, só marca a conta como ativa).
- `POST /reenviar_codigo/{email}`: reenvia o código de ativação para o e-mail da própria conta;
  não revela o código na resposta.
