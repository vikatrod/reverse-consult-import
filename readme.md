# Como usar
---



### 1. Enviar CIDR

<pre>
curl -X POST http://127.0.0.1:3000/importar \
  -H "Content-Type: application/json" \
  -d '{"cidr":"45.229.104.0/24", "domain_id":1385}'
</pre>


### 2. Enviar Reverse Zone:

<pre>
curl -X POST http://127.0.0.1:3000/importar \
  -H "Content-Type: application/json" \
  -d '{"reverse_zone":"104.229.45.in-addr.arpa", "domain_id":1385}'
</pre>

---

# Reverse Importer API

🚀 Webservice Node.js para buscar e importar registros de DNS Reverso (PTR) a partir de um bloco CIDR ou zona reversa (`in-addr.arpa`), gravando diretamente no banco de dados.

---

## 📚 Sumário

- [Sobre o Projeto](#sobre-o-projeto)
- [Endpoints da API](#endpoints-da-api)
  - [Buscar Reverso - `/buscar-reverso`](#buscar-reverso---buscar-reverso)
  - [Gravar Registros Manualmente - `/gravar`](#gravar-registros-manualmente---gravar)
  - [Importar Direto - `/importar`](#importar-direto---importar)
- [Funcionamento da Importação](#funcionamento-da-importação)
- [Estrutura Esperada da Tabela `records`](#estrutura-esperada-da-tabela-records)
- [Instalação e Configuração](#instalação-e-configuração)
- [Requisitos](#requisitos)
- [Contato](#contato)
- [Notas Finais](#notas-finais)

---

## 📖 Sobre o Projeto

O **Reverse Importer** automatiza a coleta de registros PTR, resolvendo IPs para nomes reversos e gravando ou atualizando os registros no banco de dados.

✅ Resolve IPs de CIDRs ou zonas reversas.  
✅ Insere novos registros ou atualiza os existentes.  
✅ Não exige índice `UNIQUE`.  
✅ Evita duplicações manualmente no código.

---

## 📦 Endpoints da API

---

### Buscar Reverso - `/buscar-reverso`

**POST** `/buscar-reverso`

Consulta IPs de uma rede CIDR e resolve seus PTRs.

#### 📥 Request Body

```
{
  "cidr": "45.229.104.0/24"
}
```

| Campo | Tipo   | Obrigatório | Descrição                  |
|-------|--------|--------------|-----------------------------|
| cidr  | string | Sim          | Bloco IP no formato CIDR.    |

---

#### 📤 Exemplo de Response

```
{
  "cidr": "45.229.104.0/24",
  "resultados": [
    { "ip": "45.229.104.1", "ptr": "host1.exemplo.com.br" },
    { "ip": "45.229.104.2", "ptr": null }
  ]
}
```

> IPs sem reverso configurado retornam `ptr: null`.

---

### Gravar Registros Manualmente - `/gravar`

**POST** `/gravar`

Grava registros PTR manualmente no banco a partir de uma lista enviada.

#### 📥 Request Body

```
{
  "domain_id": 1385,
  "registros": [
    { "ip": "45.229.104.1", "ptr": "host1.exemplo.com.br" },
    { "ip": "45.229.104.2", "ptr": "host2.exemplo.com.br" }
  ]
}
```

| Campo      | Tipo     | Obrigatório | Descrição                              |
|------------|----------|--------------|----------------------------------------|
| domain_id  | integer  | Sim          | ID da zona reversa no banco de dados. |
| registros  | array    | Sim          | Lista de objetos contendo IP e PTR.   |

---

#### 📤 Exemplo de Response

```
{
  "message": "✅ Registros gravados com sucesso"
}
```

---

### Importar Direto - `/importar`

**POST** `/importar`

Consulta automaticamente IPs a partir de CIDR ou Reverse Zone e grava no banco.

#### 📥 Request Body usando CIDR

```
{
  "cidr": "45.229.104.0/24",
  "domain_id": 1385
}
```

#### 📥 Request Body usando Reverse Zone

```
{
  "reverse_zone": "104.229.45.in-addr.arpa",
  "domain_id": 1385
}
```

| Campo        | Tipo    | Obrigatório | Descrição                                |
|--------------|---------|--------------|------------------------------------------|
| cidr         | string  | Opcional     | Bloco de IPs no formato CIDR.            |
| reverse_zone | string  | Opcional     | Zona reversa para calcular IPs.          |
| domain_id    | integer | Sim          | ID da zona reversa no banco de dados.    |

> É obrigatório informar **CIDR** ou **Reverse Zone**.

---

#### 📤 Exemplo de Response

```
{
  "message": "✅ Importação concluída!"
}
```

---

## 🧠 Funcionamento da Importação

- Para cada IP gerado:
  1. Realiza a resolução PTR via DNS.
  2. Se o IP (`name`) + tipo `PTR` já existir:
     - Atualiza o `content`, `ttl` e `auth`.
  3. Se não existir:
     - Insere novo registro.
- IPs sem PTR resolvido são ignorados.

✅ Sem duplicações.  
✅ Código cuida da consistência no banco.

---

## 🗃️ Estrutura Esperada da Tabela `records`

| Campo     | Tipo           | Descrição                                       |
|-----------|----------------|-------------------------------------------------|
| id        | bigint(20)      | Identificador único (chave primária).           |
| name      | varchar(255)    | Nome reverso (ex: `1.104.229.45.in-addr.arpa`). |
| content   | varchar(255)    | Nome PTR resolvido.                            |
| type      | varchar(10)     | Tipo do registro (`PTR`).                      |
| ttl       | int             | Time to Live (padrão 3600).                    |
| domain_id | int             | ID da zona associada.                          |
| auth      | tinyint(1)      | 1 para registros autorizados.                 |

---

## ⚙️ Instalação e Configuração

### 1. Clone o repositório

```
git clone https://seurepositorio/reverse-importer.git
cd reverse-importer
```

### 2. Instale as dependências

```
npm install
```

### 3. Configure o ambiente `.env`

```
DB_HOST=localhost
DB_USER=usuario
DB_PASSWORD=senha
DB_DATABASE=pdns
TTL=3600
BASIC_USER=admin
BASIC_PASS=senha123
```

### 4. Inicie o servidor

```
npm start
```

---

## 🛠️ Requisitos

- Node.js v18 ou superior
- MariaDB v10.5 ou superior
- Dependências Node.js:
  - express
  - body-parser
  - dotenv
  - ip-cidr
  - mysql2

---

## 📑 Notas Finais

- Compatível com PowerDNS e outras estruturas similares de banco de dados DNS.
- Projetado para fácil expansão.
- Pode ser adaptado para paralelização de importações de grandes blocos IPs (/21, /20).

---
