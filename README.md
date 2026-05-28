# Sistema de reservas Flor do Cerrado

Sistema interno para controlar reservas da chacara em mais de um computador ou celular.

## Recursos atuais

- Calendario mensal de reservas.
- Dashboard anual com os 12 meses e dias ocupados.
- Reservas de 1 ou mais dias seguidos.
- Bloqueio de conflito quando um periodo reservado cruza com outro.
- Cadastro de pagamentos combinados por data, valor e status.
- Gerador simples de parcelas fixas.
- Aba de pagamento interno para calcular o valor devido ao funcionario por mes.

## Como iniciar

1. Abra o arquivo `iniciar-sistema.bat`.
2. Mantenha a janela aberta enquanto estiver usando o sistema.
3. Neste computador, acesse `http://localhost:4173`.
4. Em outro computador ou celular na mesma rede Wi-Fi, acesse o endereco que aparecer na janela, parecido com `http://192.168.0.10:4173`.

## Onde ficam os dados

As reservas ficam salvas em `data/reservations.json`.

Faca copia desse arquivo periodicamente. Ele e o banco de dados simples desta versao.

## Observacoes

- O computador que iniciou o sistema precisa ficar ligado.
- Celular e outros computadores precisam estar na mesma rede.
- Se o Windows Firewall perguntar, permita o acesso em rede privada.
- Esta versao ainda nao tem login. Use apenas em rede confiavel.

## Opcional para quem tem Node.js

Tambem existe um servidor em `server.js`, mas o caminho recomendado no Windows e usar `iniciar-sistema.bat`, que roda com PowerShell e nao depende de instalar Node.js.
