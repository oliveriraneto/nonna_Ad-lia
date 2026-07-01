// cardapio.js — Nonna Adélia
// Marcação de itens, cálculo de frete por CEP e confirmação de pedido/pagamento via WhatsApp.

// ── WhatsApp da pizzaria ───────────────────────────────────────
const WHATSAPP_NUMERO = '5585984080685';

// ── Pizzaria — coordenadas fixas ─────────────────────────────
const PIZZARIA_LAT = -3.7299; // Caucaia-CE, Trav. Pedro Gomes da Rocha 24
const PIZZARIA_LNG = -38.6530;

// ── Tabela de frete ───────────────────────────────────────────
const FRETE = [
    { km: 0.5, min: 27, taxa: 4.99 },
    { km: 1, min: 30, taxa: 4.99 },
    { km: 1.5, min: 32, taxa: 6.99 },
    { km: 2, min: 33, taxa: 6.99 },
    { km: 2.5, min: 35, taxa: 7.99 },
    { km: 3, min: 36, taxa: 7.99 },
    { km: 3.5, min: 36, taxa: 8.99 },
    { km: 4, min: 37, taxa: 8.99 },
    { km: 4.5, min: 38, taxa: 10.99 },
    { km: 5, min: 39, taxa: 10.99 },
    { km: 5.5, min: 40, taxa: 11.99 },
    { km: 6, min: 42, taxa: 12.99 },
    { km: 6.5, min: 43, taxa: 13.99 },
    { km: 7, min: 44, taxa: 14.99 },
    { km: 7.5, min: 45, taxa: 15.99 },
    { km: 8, min: 46, taxa: 16.99 },
    { km: 8.5, min: 47, taxa: 16.99 },
    { km: 9, min: 48, taxa: 17.99 },
    { km: 9.5, min: 49, taxa: 18.99 },
    { km: 10, min: 51, taxa: 18.99 },
    { km: 10.5, min: 52, taxa: 19.99 },
    { km: 11, min: 53, taxa: 19.99 },
    { km: 11.5, min: 55, taxa: 20.99 },
    { km: 12, min: 56, taxa: 22.99 },
    { km: 12.5, min: 57, taxa: 22.99 },
    { km: 13, min: 59, taxa: 24.99 },
    { km: 13.5, min: 60, taxa: 24.99 },
    { km: 14, min: 62, taxa: 24.99 },
    { km: 14.5, min: 63, taxa: 24.99 },
    { km: 15, min: 64, taxa: 24.99 },
];

// ── Estado do frete ──────────────────────────────────────────
let freteAtualTaxa = 0;
let freteAtualMin = 0;
let freteAtualKm = 0;
let enderecoCliente = '';

// ── Utilitários ──────────────────────────────────────────────
function fmt(v) {
    return 'R$ ' + v.toFixed(2).replace('.', ',');
}

// Haversine — distância em linha reta entre duas coordenadas
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getFrete(km) {
    const arred = Math.ceil(km * 2) / 2;
    if (arred > 15) return null;
    return FRETE.find(r => r.km === arred) || FRETE[FRETE.length - 1];
}

// ── Marcação de itens (botões de preço) ───────────────────────
function toggleMarcar(btn) {
    const marcado = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!marcado));
    atualizarInfoBarra();
}

// Retorna os itens marcados com nome e preço, buscando o nome no card do item.
function getItensMarcados() {
    const botoes = document.querySelectorAll('.pizza-item-price[aria-pressed="true"], .trio-item-price[aria-pressed="true"]');
    return Array.from(botoes).map(btn => {
        const card = btn.closest('.pizza-item') || btn.closest('.trio-item');
        const nomeEl = card ? (card.querySelector('.pizza-item-name') || card.querySelector('.trio-item-name')) : null;
        const nome = nomeEl ? nomeEl.textContent.trim() : 'Item';
        const preco = parseFloat(btn.getAttribute('data-price')) || 0;
        return { nome, preco };
    });
}

function calcularSubtotal() {
    return getItensMarcados().reduce((s, item) => s + item.preco, 0);
}

function atualizarInfoBarra() {
    const info = document.getElementById('totalInfo');
    const valor = document.getElementById('totalValor');
    const btnPagar = document.getElementById('btnPagar');
    const marcados = getItensMarcados();

    if (marcados.length === 0) {
        info.textContent = 'Nenhum item marcado';
    } else {
        info.textContent = `${marcados.length} item${marcados.length > 1 ? 's' : ''} marcado${marcados.length > 1 ? 's' : ''}`;
    }

    // Limpa o total exibido e esconde o botão de pagamento sempre que a
    // seleção muda, assim o cliente sabe que precisa recalcular antes de pagar.
    valor.textContent = '';
    btnPagar.style.display = 'none';
    document.getElementById('orderSummary').style.display = 'none';
}

// ── Máscara CEP ──────────────────────────────────────────────
function mascaraCep(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    el.value = v;
    document.getElementById('freteInfo').style.display = 'none';
    document.getElementById('cepErro').style.display = 'none';
    freteAtualTaxa = 0;
    document.getElementById('orderSummary').style.display = 'none';
    document.getElementById('btnPagar').style.display = 'none';
}

// ── Busca CEP via ViaCEP + Nominatim ─────────────────────────
async function buscarCep() {
    const cep = document.getElementById('cepInput').value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    const loading = document.getElementById('cepLoading');
    const erro = document.getElementById('cepErro');
    const info = document.getElementById('freteInfo');

    loading.style.display = 'block';
    erro.style.display = 'none';
    info.style.display = 'none';
    freteAtualTaxa = 0;

    try {
        // 1. Busca dados do CEP
        const res = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
        const data = await res.json();

        if (data.erro) throw new Error('CEP não encontrado.');

        const endFormatado = data.logradouro ?
            data.logradouro + ', ' + data.bairro + ' - ' + data.localidade + '/' + data.uf :
            data.bairro + ' - ' + data.localidade + '/' + data.uf;

        enderecoCliente = endFormatado;

        // 2. Geocodifica via Nominatim (OpenStreetMap, gratuito)
        const query = encodeURIComponent(endFormatado + ', Brasil');
        const geoRes = await fetch(
            'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + query, { headers: { 'Accept-Language': 'pt-BR' } }
        );
        const geoData = await geoRes.json();

        if (!geoData.length) throw new Error('Não foi possível localizar o endereço. Tente novamente.');

        const clienteLat = parseFloat(geoData[0].lat);
        const clienteLng = parseFloat(geoData[0].lon);

        // 3. Distância em linha reta + fator de rota (~1.3x)
        const distReta = haversine(PIZZARIA_LAT, PIZZARIA_LNG, clienteLat, clienteLng);
        const distRota = distReta * 1.3;
        freteAtualKm = distRota;

        const row = getFrete(distRota);

        loading.style.display = 'none';

        if (!row) {
            erro.style.display = 'block';
            erro.textContent = 'Endereço fora da área de entrega (' + distRota.toFixed(1) + ' km). Entregamos até 15 km.';
            freteAtualTaxa = 0;
            return;
        }

        freteAtualTaxa = row.taxa;
        freteAtualMin = row.min;

        document.getElementById('cepEndereco').textContent = endFormatado;
        document.getElementById('freteDistancia').textContent = distRota.toFixed(1) + ' km';
        document.getElementById('freteTempo').textContent = row.min + ' min';
        document.getElementById('freteValor').textContent = fmt(row.taxa);
        info.style.display = 'block';

    } catch (e) {
        loading.style.display = 'none';
        erro.style.display = 'block';
        erro.textContent = e.message || 'Erro ao calcular frete. Tente novamente.';
        freteAtualTaxa = 0;
    }
}

// ── Entrega / Retirada ───────────────────────────────────────
function isEntrega() {
    const el = document.querySelector('input[name="entrega"]:checked');
    return el ? el.value === 'entrega' : false;
}

function onEntregaChange() {
    const entrega = isEntrega();
    document.getElementById('enderecoBlock').style.display = entrega ? 'block' : 'none';
    if (!entrega) {
        document.getElementById('freteInfo').style.display = 'none';
        document.getElementById('cepErro').style.display = 'none';
        document.getElementById('cepInput').value = '';
        freteAtualTaxa = 0;
    }
    document.getElementById('orderSummary').style.display = 'none';
    document.getElementById('btnPagar').style.display = 'none';
}

function getFreteAtual() {
    return isEntrega() ? freteAtualTaxa : 0;
}

// ── Calcular total (subtotal + frete) ─────────────────────────
function calcularTotal() {
    const marcados = getItensMarcados();
    const valorEl = document.getElementById('totalValor');
    const infoEl = document.getElementById('totalInfo');
    const btnPagar = document.getElementById('btnPagar');
    const summary = document.getElementById('orderSummary');

    if (marcados.length === 0) {
        infoEl.textContent = 'Nenhum item marcado';
        valorEl.textContent = '';
        btnPagar.style.display = 'none';
        summary.style.display = 'none';
        return;
    }

    const entrega = isEntrega();

    if (entrega && freteAtualTaxa === 0) {
        alert('Digite seu CEP e clique em "Calcular frete" antes de calcular o total.');
        btnPagar.style.display = 'none';
        summary.style.display = 'none';
        return;
    }

    const sub = calcularSubtotal();
    const frete = getFreteAtual();
    const total = sub + frete;

    infoEl.textContent = `${marcados.length} item${marcados.length > 1 ? 's' : ''} marcado${marcados.length > 1 ? 's' : ''}`;
    valorEl.textContent = `Total: ${fmt(total)}`;

    document.getElementById('sumSubtotal').textContent = fmt(sub);
    document.getElementById('sumFreteRow').style.display = entrega ? 'flex' : 'none';
    document.getElementById('sumFrete').textContent = fmt(frete);
    document.getElementById('sumTotal').textContent = fmt(total);
    summary.style.display = 'block';

    btnPagar.style.display = 'inline-flex';
}

// ── Validação antes de pagar ───────────────────────────────────
function validar() {
    const marcados = getItensMarcados();
    if (marcados.length === 0) {
        alert('Marque ao menos um item do cardápio.');
        return false;
    }
    if (isEntrega()) {
        const cep = document.getElementById('cepInput').value.replace(/\D/g, '');
        if (cep.length !== 8) {
            alert('Digite um CEP válido para calcular o frete.');
            return false;
        }
        if (freteAtualTaxa === 0 && document.getElementById('freteInfo').style.display === 'none') {
            alert('Clique em "Calcular frete" antes de finalizar.');
            return false;
        }
        if (freteAtualKm > 15) {
            alert('Desculpe, não entregamos além de 15 km.');
            return false;
        }
    }
    return true;
}

// ── Mensagem de confirmação de pedido/pagamento ────────────────
function montarMensagemConfirmacao() {
    const marcados = getItensMarcados();
    const entrega = isEntrega();
    const sub = calcularSubtotal();
    const frete = getFreteAtual();
    const total = sub + frete;

    let msg = 'Olá, Nonna Adélia! Acabei de realizar o pagamento via Pix ✅\n\n';
    msg += 'Meu pedido:\n';
    msg += marcados.map(item => '  - ' + item.nome + ' - ' + fmt(item.preco)).join('\n') + '\n\n';

    if (entrega) {
        msg += 'Modalidade: Entrega\n';
        msg += 'Endereço: ' + enderecoCliente + '\n';
        msg += 'Distância: ' + freteAtualKm.toFixed(1) + ' km\n';
        msg += 'Previsão: ' + freteAtualMin + ' min\n';
        msg += 'Taxa de entrega: ' + fmt(frete) + '\n';
    } else {
        msg += 'Modalidade: Retirada no local\n';
    }

    msg += '\nSubtotal: ' + fmt(sub);
    if (entrega) msg += '\nFrete: ' + fmt(frete);
    msg += '\nTotal pago: ' + fmt(total);
    msg += '\n\nSegue o comprovante em anexo. Aguardo a confirmação do pedido!';
    return msg;
}

// ── Pagamento via Pix + confirmação automática no WhatsApp ─────
function pagarComPix(event) {
    if (event) event.preventDefault();
    if (!validar()) return false;

    // 1. Abre o link de pagamento (Mercado Pago / Pix)
    window.open('https://link.mercadopago.com.br/nonnadeliapizza', '_blank');

    // 2. Logo em seguida, abre o WhatsApp já com a mensagem de confirmação
    //    do pagamento e o resumo do pedido, para o cliente só enviar.
    setTimeout(() => {
        const url = 'https://api.whatsapp.com/send/?phone=' + WHATSAPP_NUMERO +
            '&text=' + encodeURIComponent(montarMensagemConfirmacao()) +
            '&type=phone_number&app_absent=0';
        window.open(url, '_blank');
    }, 800);

    return false;
}