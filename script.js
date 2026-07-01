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

function extrairPreco(valor) {
    const m = valor.match(/R\$\s*([\d.,]+)/);
    if (!m) return 0;
    return parseFloat(m[1].replace('.', '').replace(',', '.'));
}

function calcularSubtotal() {
    return [...document.querySelectorAll('input[name="pizza"]:checked, input[name="bebida"]:checked')]
        .reduce((s, i) => s + extrairPreco(i.value), 0);
}

function getFrete(km) {
    const arred = Math.ceil(km * 2) / 2;
    if (arred > 15) return null;
    return FRETE.find(r => r.km === arred) || FRETE[FRETE.length - 1];
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

// ── Máscara CEP ──────────────────────────────────────────────
function mascaraCep(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    el.value = v;
    document.getElementById('freteInfo').style.display = 'none';
    document.getElementById('cepErro').style.display = 'none';
    freteAtualTaxa = 0;
    atualizarResumo();
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

        if (data.erro) throw new Error('CEP nao encontrado.');

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

        if (!geoData.length) throw new Error('Nao foi possivel localizar o endereco. Tente novamente.');

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
            erro.textContent = 'Endereco fora da area de entrega (' + distRota.toFixed(1) + ' km). Entregamos ate 15 km.';
            freteAtualTaxa = 0;
            atualizarResumo();
            return;
        }

        freteAtualTaxa = row.taxa;
        freteAtualMin = row.min;

        document.getElementById('cepEndereco').textContent = endFormatado;
        document.getElementById('freteDistancia').textContent = distRota.toFixed(1) + ' km';
        document.getElementById('freteTempo').textContent = row.min + ' min';
        document.getElementById('freteValor').textContent = fmt(row.taxa);
        info.style.display = 'block';

        atualizarResumo();

    } catch (e) {
        loading.style.display = 'none';
        erro.style.display = 'block';
        erro.textContent = e.message || 'Erro ao calcular frete. Tente novamente.';
        freteAtualTaxa = 0;
        atualizarResumo();
    }
}

// ── Entrega / Retirada ───────────────────────────────────────
function onEntregaChange() {
    const entrega = document.querySelector('input[name="entrega"]:checked').value === 'entrega';
    document.getElementById('enderecoBlock').style.display = entrega ? 'block' : 'none';
    if (!entrega) {
        document.getElementById('freteInfo').style.display = 'none';
        document.getElementById('cepErro').style.display = 'none';
        document.getElementById('cepInput').value = '';
        freteAtualTaxa = 0;
    }
    atualizarResumo();
}

function getFreteAtual() {
    const entrega = document.querySelector('input[name="entrega"]:checked').value === 'entrega';
    return entrega ? freteAtualTaxa : 0;
}

// ── Resumo ───────────────────────────────────────────────────
function atualizarResumo() {
    const sub = calcularSubtotal();
    const frete = getFreteAtual();
    const total = sub + frete;
    const entrega = document.querySelector('input[name="entrega"]:checked').value === 'entrega';

    document.getElementById('orderSummary').style.display = sub > 0 ? 'block' : 'none';
    document.getElementById('sumSubtotal').textContent = fmt(sub);
    document.getElementById('sumFreteRow').style.display = entrega ? 'flex' : 'none';
    document.getElementById('sumFrete').textContent = fmt(frete);
    document.getElementById('sumTotal').textContent = fmt(total);
}

document.addEventListener('change', function(e) {
    if (e.target.name === 'pizza' || e.target.name === 'bebida') atualizarResumo();
});

// ── Form toggle ──────────────────────────────────────────────
function toggleOrderForm() {
    const form = document.getElementById('orderForm');
    const btn = document.querySelector('.btn-order-toggle');
    const open = form.classList.toggle('open');
    btn.textContent = open ? 'Fechar' : 'Montar Pedido';
    if (open) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Validacao ────────────────────────────────────────────────
function validar() {
    const pizzas = document.querySelectorAll('input[name="pizza"]:checked');
    if (pizzas.length === 0) {
        alert('Escolha ao menos uma pizza.');
        return false;
    }
    const entrega = document.querySelector('input[name="entrega"]:checked').value === 'entrega';
    if (entrega) {
        const cep = document.getElementById('cepInput').value.replace(/\D/g, '');
        if (cep.length !== 8) {
            alert('Digite um CEP valido para calcular o frete.');
            return false;
        }
        if (freteAtualTaxa === 0 && document.getElementById('freteInfo').style.display === 'none') {
            alert('Clique em "Calcular frete" antes de finalizar.');
            return false;
        }
        if (freteAtualKm > 15) {
            alert('Desculpe, nao entregamos alem de 15 km.');
            return false;
        }
    }
    return true;
}

// ── Mensagem ─────────────────────────────────────────────────
function montarMensagem() {
    const pizzas = [...document.querySelectorAll('input[name="pizza"]:checked')].map(i => '  - ' + i.value);
    const bebidas = [...document.querySelectorAll('input[name="bebida"]:checked')].map(i => '  - ' + i.value);
    const obs = document.getElementById('obs').value.trim();
    const entrega = document.querySelector('input[name="entrega"]:checked').value === 'entrega';
    const sub = calcularSubtotal();
    const frete = getFreteAtual();
    const total = sub + frete;

    let msg = 'Ola, Nonna Adelia! Quero fazer um pedido:\n\n';
    msg += (pizzas.length > 1 ? 'Pizzas' : 'Pizza') + ':\n' + pizzas.join('\n') + '\n\n';
    if (bebidas.length > 0) msg += (bebidas.length > 1 ? 'Bebidas' : 'Bebida') + ':\n' + bebidas.join('\n') + '\n\n';
    else msg += 'Bebida: Sem bebida\n\n';
    if (entrega) {
        msg += 'Modalidade: Entrega\n';
        msg += 'Endereco: ' + enderecoCliente + '\n';
        msg += 'Distancia: ' + freteAtualKm.toFixed(1) + ' km\n';
        msg += 'Previsao: ' + freteAtualMin + ' min\n';
        msg += 'Taxa de entrega: ' + fmt(frete) + '\n';
    } else {
        msg += 'Modalidade: Retirada no local\n';
    }
    if (obs) msg += 'Observacoes: ' + obs + '\n';
    msg += '\nSubtotal: ' + fmt(sub);
    if (entrega) msg += '\nFrete: ' + fmt(frete);
    msg += '\nTotal: ' + fmt(total);
    msg += '\n\nAguardo confirmacao!';
    return msg;
}

function enviarWhatsapp() {
    if (!validar()) return;
    const url = 'https://api.whatsapp.com/send/?phone=5585984080685&text=' +
        encodeURIComponent(montarMensagem()) + '&type=phone_number&app_absent=0';
    window.open(url, '_blank');
}

function pagarMercadoPago() {
    if (!validar()) return;
    const url = 'https://api.whatsapp.com/send/?phone=5585984080685&text=' +
        encodeURIComponent('[PAGAMENTO ONLINE]\n\n' + montarMensagem()) + '&type=phone_number&app_absent=0';
    window.open(url, '_blank');
    setTimeout(() => window.open('https://link.mercadopago.com.br/nonnadeliapizza', '_blank'), 800);
}