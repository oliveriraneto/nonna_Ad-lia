// api/create-preference.js
// Função serverless (Vercel) que cria uma "preferência" de pagamento no
// Mercado Pago já com o valor exato do pedido, e devolve o link (init_point)
// pronto para o cliente pagar — sem precisar digitar nada.
//
// IMPORTANTE: o Access Token NUNCA fica no código. Ele é lido de uma
// variável de ambiente configurada no painel da Vercel:
//   Project Settings → Environment Variables → MERCADOPAGO_ACCESS_TOKEN

module.exports = async(req, res) => {
    // Só aceita POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
        console.error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
        res.status(500).json({ error: 'Configuração de pagamento ausente no servidor.' });
        return;
    }

    try {
        const { itens } = req.body || {};

        if (!Array.isArray(itens) || itens.length === 0) {
            res.status(400).json({ error: 'Nenhum item enviado.' });
            return;
        }

        // Monta os itens no formato que o Mercado Pago espera.
        // Cada item vira uma linha no checkout (pizza, bebida, taxa de entrega...).
        const items = itens.map((item) => ({
            title: String(item.nome || 'Item').slice(0, 250),
            quantity: 1,
            unit_price: Number(item.preco) || 0,
            currency_id: 'BRL',
        }));

        const preference = {
            items,
            // URLs de retorno após o pagamento.
            back_urls: {
                success: 'https://nonna-ad-lia.vercel.app/cardapio.html',
                failure: 'https://nonna-ad-lia.vercel.app/cardapio.html',
                pending: 'https://nonna-ad-lia.vercel.app/cardapio.html',
            },
            // 'all' garante o redirecionamento de volta ao site mesmo quando
            // o pagamento fica "pendente" (comum no Pix por alguns segundos)
            // e não só quando já está aprovado — evita a tela ficar travada.
            auto_return: 'all',
            // Libera Pix, cartão de crédito e débito no checkout.
            // Mantém bloqueados boleto (ticket) e pagamento em caixa (atm),
            // que não fazem sentido para entrega/retirada de pizza.
            payment_methods: {
                excluded_payment_types: [
                    { id: 'ticket' },
                    { id: 'atm' },
                ],
            },
        };

        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify(preference),
        });

        const data = await mpResponse.json();

        if (!mpResponse.ok) {
            console.error('Erro Mercado Pago:', data);
            res.status(500).json({ error: 'Não foi possível gerar o link de pagamento.' });
            return;
        }

        // init_point = link de checkout já com o valor certo
        res.status(200).json({ init_point: data.init_point });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno ao gerar pagamento.' });
    }
};