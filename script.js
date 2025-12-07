// ============================================================================
// PARTE 1: CONFIGURAÇÃO E VARIÁVEIS GLOBAIS
// ============================================================================

// --- DADOS DE CONEXÃO SUPABASE ---
const SUPABASE_URL = 'https://ligndfhjxgbjiswemkku.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpZ25kZmhqeGdiamlzd2Vta2t1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTU5MTcsImV4cCI6MjA3OTE3MTkxN30.IuvFV1eb489ApmbTJCWuaDfdd5H0i81FeP3gKS30Ik8';

// Inicializa o cliente usando o objeto global do script CDN (window.supabase)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ESTADO GLOBAL ---
let userProfile = null;       // Dados do usuário logado
let currentUserId = null;     // ID do usuário logado
let activeTab = 'uniformes_roupas';   // Aba ativa no momento
let selectedRowId = null;     // ID da linha selecionada na tabela
let itensPedidoTemporario = []; // Array para guardar itens antes de salvar o pedido

// ============================================================================
// PARTE 2: INICIALIZAÇÃO (DOM LOADED)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Referências aos elementos do HTML
    const loginScreen = document.getElementById('login-container');
    const mainApp = document.getElementById('app-container');
    const btnLogin = document.getElementById('login-btn');
    const btnLogout = document.getElementById('logout-btn');
    const btnConfig = document.getElementById('btn-config'); // Botão de configurações no header
    const tabsContainer = document.getElementById('tabs');
    const loginError = document.getElementById('login-error');

    // --- EVENTO: LOGIN ---
    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value.trim();
            const senha = document.getElementById('login-password').value.trim();

            if (!email || !senha) {
                alert('Preencha email e senha.');
                return;
            }

            // Feedback visual de carregamento
            btnLogin.innerText = "Entrando...";
            btnLogin.disabled = true;

            try {
                const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password: senha });
                if (error) throw error;

                currentUserId = authData.user.id;
                await loadUserProfile(currentUserId);
                // [NOVO] Aplica as regras de visibilidade
                aplicarRestricoesInterface(); 
                // Troca as telas
                loginScreen.style.display = 'none'; // Esconde login
                mainApp.classList.remove('hidden'); // Remove classe hidden
                mainApp.style.display = 'block';    // Garante visibilidade

                // Carrega a aba inicial
                window.renderTab('uniformes_roupas');

            } catch (e) {
                console.error(e);
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.innerText = 'Erro: ' + e.message;
                } else {
                    alert('Erro no login: ' + e.message);
                }
            } finally {
                btnLogin.innerText = "Entrar";
                btnLogin.disabled = false;
            }
        });
    }

    // --- EVENTO: LOGOUT ---
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });
    }

    // --- EVENTO: ABRIR CONFIGURAÇÕES ---
    if (btnConfig) {
        btnConfig.addEventListener('click', () => {
            window.openConfigModal();
        });
    }

    // --- EVENTO: NAVEGAÇÃO ENTRE ABAS ---
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-button');
            if (btn) {
                // Remove classe active de todos
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                // Adiciona no clicado
                btn.classList.add('active');
                
                activeTab = btn.dataset.tab;
                selectedRowId = null; // Reseta seleção
                window.renderTab(activeTab);
            }
        });
    }
});

// ============================================================================
// PARTE 3: FUNÇÕES GLOBAIS AUXILIARES (Perfil, Histórico e Modais)
// ============================================================================

// Carrega perfil do usuário para definir permissões
async function loadUserProfile(uid) {
    // [Modificação] Adicionado 'unidade_id' na seleção
    const { data, error } = await supabase.from('usuarios')
        .select('nivel_acesso, nome_completo, unidade_id') 
        .eq('id', uid)
        .single();

    if (error || !data) {
        userProfile = { nivel: 'comum', nome: 'Desconhecido', unidadeId: null };
    } else {
        // [Modificação] Salvamos a unidadeId no objeto global
        userProfile = { 
            nivel: data.nivel_acesso, 
            nome: data.nome_completo,
            unidadeId: data.unidade_id 
        };
    }
}

function aplicarRestricoesInterface() {
    if (userProfile.nivel === 'comum') {
        // 1. Lista de abas para esconder (IDs do data-tab)
        const abasProibidas = [
            'uniformes_roupas', 
            'uniformes_calcados', 
            'estoque_consumo', // Aba Material
            'patrimonio',
            'historico', 
            'relatorios', 
            'calculadora'
            // Nota: 'pedidos' e 'historico' permanecem visíveis (a menos que queira tirar histórico também)
        ];

        // Esconde os botões das abas
        abasProibidas.forEach(tab => {
            const btn = document.querySelector(`.tab-button[data-tab="${tab}"]`);
            if (btn) btn.style.display = 'none';
        });

        // 2. Esconde o botão de Configurações no cabeçalho
        const btnConfig = document.getElementById('btn-config');
        if (btnConfig) btnConfig.style.display = 'none';

        // 3. Força a navegação imediata para a única aba útil: Pedidos
        // Remove a classe 'active' da aba padrão (uniformes) e ativa pedidos
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        const btnPedidos = document.querySelector(`.tab-button[data-tab="pedidos"]`);
        
        if (btnPedidos) {
            btnPedidos.classList.add('active');
            activeTab = 'pedidos';
            window.renderTab('pedidos');
        }
    }
}

// --- FUNÇÃO CORRIGIDA: REGISTRAR HISTÓRICO ---
async function registrarHistorico(produtoId, quantidade, tipo, observacao, responsavel, unidadeId, volumes = 0) {
    // Tratamento de segurança para o ID da unidade
    // Se vier vazio "", nulo ou undefined, transformamos em NULL para o banco aceitar
    const idDestino = (unidadeId && unidadeId !== "" && unidadeId !== "null") ? parseInt(unidadeId) : null;

    console.log(`Gravando histórico: ${tipo} | Qtd: ${quantidade} | Destino: ${idDestino}`);

    try {
        const { error } = await supabase
            .from('historico_global')
            .insert({
                produto_id: produtoId,
                quantidade: quantidade,
                tipo_movimento: tipo,      // Ex: ENTRADA_MATERIAL
                observacao: observacao,
                responsavel_nome: responsavel,
                // AQUI ESTAVA O ERRO: O nome correto da coluna no banco é unidade_destino_id
                unidade_destino_id: idDestino, 
                volumes: volumes,
                data_movimentacao: new Date().toISOString()
            });

        if (error) {
            console.error("Erro Supabase ao gravar histórico:", error.message);
            alert("Erro ao gravar histórico (ver console): " + error.message);
        }
    } catch (e) {
        console.error("Erro técnico no histórico:", e);
    }
}

// --- CONTROLE DE MODAIS (Global window) ---

// Fecha modal genérico
window.closeModal = function() {
    document.getElementById('global-modal').style.display = 'none';
}

// Fecha modal de configuração
window.closeConfigModal = function() {
    document.getElementById('config-modal').style.display = 'none';
}

// Abre modal de configuração
window.openConfigModal = function() {
    document.getElementById('config-modal').style.display = 'block';
    window.navegarConfig('catalogo'); // Abre primeira aba por padrão
}

// Navegação interna do modal de configuração
window.navegarConfig = function(subtab) {
    // Atualiza estilo dos botões
    document.querySelectorAll('.config-submenu-button').forEach(b => b.classList.remove('active'));
    // (Opcional) Adicionar active visualmente no botão clicado se tiver referência
    
    const area = document.getElementById("config-content-area");
    if (!area) return;

    // Roteamento das sub-abas de configuração
    if (subtab === 'catalogo') renderSubTabCatalogo();
    else if (subtab === 'categorias') renderSubTabCategorias();
    else if (subtab === 'locais') renderSubTabLocais();
    else if (subtab === 'usuarios') renderSubTabUsuarios();
    else if (subtab === 'tamanhos_roupas') renderSubTabTamanhosRoupas();
    else if (subtab === 'tamanhos_calcados') renderSubTabTamanhosCalcados();
}

// ============================================================================
// PARTE 4: RENDERIZAÇÃO PRINCIPAL (ABAS E TABELAS)
// ============================================================================

window.renderTab = async function(tabName) {
    const tabContentArea = document.getElementById('tab-content');
    
    // Roteamento para abas especiais (que têm layout próprio)
    if (tabName === 'calculadora') { renderCalculadora(); return; }
    if (tabName === 'relatorios') { renderMenuRelatorios(); return; }
    if (tabName === 'uniformes_roupas') { renderTabUniformesRoupas(); return; }
    if (tabName === 'uniformes_calcados') { renderTabUniformesCalcados(); return; }

    // Loading
    tabContentArea.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

    let data = [];
    let html = '';

    try {
        // Buscas no banco de dados baseadas na aba
        if (tabName === 'catalogo') {
            const { data: res } = await supabase.from('catalogo').select('*').order('nome');
            data = res;
        } 
        else if (tabName === 'estoque_consumo') {
            const { data: res } = await supabase.from('estoque_consumo')
                .select('id, quantidade_atual, local_fisico, catalogo(nome, unidade_medida, estoque_minimo)').order('id');
            if(res) data = res.sort((a,b) => (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || ''));
        } 
        else if (tabName === 'historico') {
            const { data: res } = await supabase.from('historico_global')
                .select('id, data_movimentacao, tipo_movimento, quantidade, responsavel_nome, observacao, catalogo(nome, categoria, unidade_medida), unidades!unidade_destino_id(nome)')
                .order('data_movimentacao', { ascending: false }).limit(50);
            data = res;
        }
        else if (tabName === 'patrimonio') {
            // Inicia a query base
            let query = supabase.from('patrimonio')
                .select('id, codigo_patrimonio, estado_conservacao, inservivel, catalogo(nome), unidades:unidade_id(nome)');

            // [Demanda 2a] Se for comum, filtra pela unidade do usuário
            if (userProfile.nivel === 'comum' && userProfile.unidadeId) {
                query = query.eq('unidade_id', userProfile.unidadeId);
            }

            const { data: res, error } = await query; // Executa a query montada
            
            if (error) console.error(error);
            // Ordenação via JavaScript permanece a mesma
            if(res) data = res.sort((a,b) => (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || ''));
        }
        else if (tabName === 'pedidos') {
            // Inicia a query base
            let query = supabase.from('pedidos')
                .select('id, status, data_solicitacao, unidades(nome)')
                .order('data_solicitacao', { ascending: false });

            // [Demanda 2b] Lógica para usuário comum
            if (userProfile.nivel === 'comum' && userProfile.unidadeId) {
                // Filtra status EM TRÂNSITO (usando a string 'em_transito' conforme o script original)
                // E filtra se a unidade de destino for a unidade do usuário
                query = query.eq('status', 'em_transito')
                            .eq('unidade_destino_id', userProfile.unidadeId);
            }

            const { data: res, error } = await query;
            if (error) console.error(error);
            data = res || [];
        }
        // Constrói o HTML
        html += renderActionButtons(tabName);
        html += renderTable(tabName, data);
        tabContentArea.innerHTML = html;
        
        // Ativa eventos de clique na tabela
        setupTableEvents(tabName);

    } catch (error) {
        console.error(error);
        tabContentArea.innerHTML = `<p style="color:red">Erro: ${error.message}</p>`;
    }
}

// --- FUNÇÃO ATUALIZADA: RENDER ACTION BUTTONS ---
function renderActionButtons(tabName) {
    const isAdmin = ['admin', 'super'].includes(userProfile?.nivel);
    let btns = '<div class="action-buttons">';

    if (isAdmin) {
        if (tabName === 'catalogo') {
            btns += `<button onclick="window.openModalCadastro('catalogo')"><i class="fas fa-plus"></i> Novo Item (Rápido)</button>`;
            btns += `<button onclick="window.openModalEntrada(null)" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Nova Entrada</button>`;
        }
        if (tabName === 'estoque_consumo') {
            btns += `<button onclick="window.openModalEntrada('consumo')" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Entrada Consumo</button>`;
            btns += `<button onclick="window.openModalSaidaRapida()" style="background-color: #ffc107; color: #333;"><i class="fas fa-arrow-up"></i> Saída Rápida</button>`;
        }
        if (tabName === 'patrimonio') {
            // REMOVIDO O BOTÃO DE INSERVÍVEL DAQUI
            btns += `<button onclick="window.openModalEntrada('permanente')" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Entrada Patrimônio</button>`;
            btns += `<button onclick="window.openModalMovimentarPatrimonio()" style="background-color: #17a2b8; color: white;"><i class="fas fa-exchange-alt"></i> Movimentar</button>`;
        }
    }
    
    if (tabName === 'pedidos') {
        btns += `<button id="btn-ver-pedido"><i class="fas fa-eye"></i> Gerenciar Pedido</button>`;
        if (isAdmin) btns += `<button onclick="window.openModalCriarPedido()"><i class="fas fa-cart-plus"></i> Criar Pedido (Admin)</button>`;
    }

    btns += '</div>';
    return btns;
}

function renderTable(tabName, data) {
    if (!data || data.length === 0) return '<p class="no-data" style="padding:15px">Nenhum registro encontrado.</p>';
    let headers = [];
    let rows = '';

    if (tabName === 'catalogo') {
        headers = ['Item', 'Tipo', 'Categoria', 'Minimo'];
        data.forEach(r => { 
            const minDisplay = (r.tipo === 'permanente') ? '-' : r.estoque_minimo;
            rows += `<tr data-id="${r.id}"><td><strong>${r.nome}</strong></td><td>${r.tipo.toUpperCase()}</td><td>${r.categoria || '-'}</td><td>${minDisplay}</td></tr>`; 
        });
    }
    else if (tabName === 'estoque_consumo') {
        headers = ['Produto', 'Qtd. Atual', 'Local', 'Status'];
        data.forEach(r => {
            const min = r.catalogo?.estoque_minimo || 0;
            const qtd = r.quantidade_atual || 0;
            let alerta = (min > 0 && qtd <= min) ? '<span style="color:red; font-weight:bold;">(BAIXO)</span>' : '';
            rows += `<tr data-id="${r.id}"><td>${r.catalogo?.nome || '?'} ${alerta}</td><td style="font-weight:bold;">${qtd} ${r.catalogo?.unidade_medida || ''}</td><td>${r.local_fisico || '-'}</td><td>Ativo</td></tr>`;
        });
    }
    else if (tabName === 'historico') {
        // ADICIONEI 'Usuário' NO CABEÇALHO ABAIXO
        headers = ['Data', 'Usuário', 'Tipo', 'Item', 'Categoria', 'Qtd', 'Detalhes'];
        
        data.forEach(r => {
            const dt = new Date(r.data_movimentacao).toLocaleString();
            let tipoClass = 'status-tag ';
            if(r.tipo_movimento?.includes('entrada')) tipoClass += 'conservacao-novo';
            else if(r.tipo_movimento?.includes('saida')) tipoClass += 'conservacao-danificado';
            else tipoClass += 'conservacao-regular';
            
            // ADICIONEI A COLUNA DO USUÁRIO (responsavel_nome) ABAIXO
            rows += `<tr>
                <td style="font-size:0.85em;">${dt}</td>
                <td style="font-weight:bold; color:#2563eb;">${r.responsavel_nome || 'Sistema'}</td>
                <td><span class="${tipoClass}">${r.tipo_movimento}</span></td>
                <td>${r.catalogo?.nome}</td>
                <td>${r.catalogo?.categoria || '-'}</td>
                <td style="font-weight:bold;">${r.quantidade}</td>
                <td style="font-size:0.9em;">${r.observacao || ''}</td>
            </tr>`;
        });
    }
    else if (tabName === 'patrimonio') {
        headers = ['Plaqueta', 'Item', 'Local Atual', 'Conservação'];
        data.forEach(r => { 
            const local = r.unidades?.nome || '<span style="color:red">Sem Local</span>';
            let estadoDisplay = r.inservivel ? 'INSERVÍVEL' : r.estado_conservacao;
            rows += `<tr data-id="${r.id}"><td>${r.codigo_patrimonio}</td><td>${r.catalogo?.nome}</td><td>${local}</td><td>${estadoDisplay}</td></tr>`; 
        });
    }
    else if (tabName === 'pedidos') {
        headers = ['ID', 'Destino', 'Data', 'Status'];
        data.forEach(r => {
            rows += `<tr data-id="${r.id}"><td>#${r.id}</td><td>${r.unidades?.nome}</td><td>${new Date(r.data_solicitacao).toLocaleDateString()}</td><td>${r.status}</td></tr>`;
        });
    }

    return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

// --- FUNÇÃO ATUALIZADA: SETUP TABLE EVENTS ---
function setupTableEvents(tabName) {
    const table = document.querySelector('.data-table');
    if(table) {
        table.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            if(tr && tr.dataset.id) {
                document.querySelectorAll('tr.selected-row').forEach(r => r.classList.remove('selected-row'));
                tr.classList.add('selected-row');
                selectedRowId = tr.dataset.id;
            }
        });
    }
    
    // Listener específico para Pedidos
    const btnVerPedido = document.getElementById('btn-ver-pedido');
    if(btnVerPedido) {
        btnVerPedido.onclick = () => {
            if(!selectedRowId) return alert('Selecione um pedido.');
            window.openModalGerenciarPedido(selectedRowId);
        };
    }
    
    // (O listener do botão inservível foi removido pois o botão não existe mais)
}

// ============================================================================
// PARTE 5: MODAL DE CONFIGURAÇÕES (SUB-ABAS)
// ============================================================================

async function renderSubTabCatalogo() {
    const area = document.getElementById("config-content-area");
    area.innerHTML = "<p>Carregando...</p>";
    const { data, error } = await supabase.from("catalogo").select("*").order("nome");
    if (error) return area.innerHTML = "Erro ao carregar catálogo.";

    let html = `<h3>Catálogo <button class="btn-confirmar" onclick="window.openModalAddCatalogo()" style="float:right">+ Novo Produto</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Nome</th><th>Tipo</th><th>Ativo</th><th>Ações</th></tr></thead><tbody>`;
    
    data.forEach(item => {
        html += `<tr><td>${item.nome}</td><td>${item.tipo}</td><td>${item.ativo?'Sim':'Não'}</td>
        <td><button class="btn-cancelar" onclick="window.deleteCatalogo(${item.id})">Excluir</button></td></tr>`;
    });
    html += "</tbody></table>";
    area.innerHTML = html;
}

async function renderSubTabCategorias() {
    const area = document.getElementById("config-content-area");
    area.innerHTML = "<p>Carregando...</p>";
    const { data } = await supabase.from("categorias").select("*").order("nome");
    
    let html = `<h3>Categorias <button class="btn-confirmar" onclick="window.openModalAddCategoria()" style="float:right">+ Nova</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Nome</th><th>Ações</th></tr></thead><tbody>`;
    if(data) {
        data.forEach(c => {
            html += `<tr><td>${c.nome}</td><td><button class="btn-cancelar" onclick="window.deleteGeneric('categorias', ${c.id})">Excluir</button></td></tr>`;
        });
    }
    html += "</tbody></table>";
    area.innerHTML = html;
}

async function renderSubTabLocais() {
    const area = document.getElementById("config-content-area");
    const { data } = await supabase.from("unidades").select("*").order("nome"); // Usando tabela 'unidades' como locais
    
    let html = `<h3>Locais/Unidades <button class="btn-confirmar" onclick="window.openModalCadastro('unidades')" style="float:right">+ Nova</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Nome</th><th>Resp.</th></tr></thead><tbody>`;
    if(data) {
        data.forEach(u => {
            html += `<tr><td>${u.nome}</td><td>${u.responsavel||'-'}</td></tr>`;
        });
    }
    html += "</tbody></table>";
    area.innerHTML = html;
}

async function renderSubTabUsuarios() {
    const area = document.getElementById("config-content-area");
    // Filtra apenas o usuário logado usando currentUserId
    const { data } = await supabase.from("usuarios").select("*").eq("id", currentUserId);
    
    let html = `<h3>Meus Dados <button class="btn-confirmar" onclick="window.modalAlterarSenha()" style="float:right; background-color:#f59e0b;">Alterar Senha</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Nome</th><th>Email</th><th>Nível</th></tr></thead><tbody>`;
    
    if(data && data.length > 0) {
        data.forEach(u => {
            html += `<tr><td>${u.nome_completo}</td><td>${u.email}</td><td>${u.nivel_acesso}</td></tr>`;
        });
    } else {
         html += `<tr><td colspan="3">Usuário não encontrado.</td></tr>`;
    }
    html += "</tbody></table>";
    area.innerHTML = html;
}

async function renderSubTabTamanhosRoupas() {
    const area = document.getElementById("config-content-area");
    const { data } = await supabase.from("tamanhos_roupas").select("*").order("ordem");
    
    // Adicionado botão + Novo
    let html = `<h3>Tamanhos (Roupas) <button class="btn-confirmar" onclick="window.addTamanhoRoupa()" style="float:right">+ Novo</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Tamanho</th><th>Ordem</th><th>Ação</th></tr></thead><tbody>`;
    
    if(data) {
        data.forEach(t => {
            html += `<tr>
                <td>${t.tamanho}</td>
                <td>${t.ordem}</td>
                <td><button class="btn-cancelar" onclick="window.deleteGeneric('tamanhos_roupas', ${t.id})">Excluir</button></td>
            </tr>`;
        });
    }
    html += `</tbody></table>`;
    area.innerHTML = html;
}

async function renderSubTabTamanhosCalcados() {
    const area = document.getElementById("config-content-area");
    const { data } = await supabase.from("tamanhos_calcados").select("*").order("ordem");
    
    // Adicionado botão + Novo
    let html = `<h3>Tamanhos (Calçados) <button class="btn-confirmar" onclick="window.addTamanhoCalcado()" style="float:right">+ Novo</button></h3>`;
    html += `<table class="table-config" style="width:100%"><thead><tr><th>Número</th><th>Ordem</th><th>Ação</th></tr></thead><tbody>`;
    
    if(data) {
        data.forEach(t => {
            html += `<tr>
                <td>${t.numero}</td>
                <td>${t.ordem}</td>
                <td><button class="btn-cancelar" onclick="window.deleteGeneric('tamanhos_calcados', ${t.id})">Excluir</button></td>
            </tr>`;
        });
    }
    html += `</tbody></table>`;
    area.innerHTML = html;
}
// ============================================================================
// PARTE 6: AÇÕES DE CONFIGURAÇÃO (CRUD)
// ============================================================================

window.openModalAddCatalogo = async function() {
    const modalContent = document.getElementById("modal-content-area");
    const modal = document.getElementById("global-modal");
    
    // Feedback visual enquanto carrega as categorias
    modalContent.innerHTML = '<p style="text-align:center; padding:20px;">Carregando categorias...</p>';
    modal.style.display = "block";

    try {
        // 1. Busca as categorias cadastradas para preencher o Select
        // Consultamos a tabela 'categorias' 
        const { data: listaCategorias, error } = await supabase
            .from("categorias")
            .select("nome")
            .order("nome");

        if (error) throw error;

        // Monta as opções do select de categorias
        let opcoesCategorias = '<option value="">Selecione uma categoria...</option>';
        if (listaCategorias && listaCategorias.length > 0) {
            listaCategorias.forEach(cat => {
                // Como o campo 'categoria' na tabela 'catalogo' é TEXTO[cite: 6],
                // usamos o nome tanto no value quanto no texto.
                opcoesCategorias += `<option value="${cat.nome}">${cat.nome}</option>`;
            });
        } else {
            opcoesCategorias += '<option value="">Nenhuma categoria cadastrada</option>';
        }

        // 2. Renderiza o HTML do modal
        // NOTA: Os values do 'novo-tipo' foram alterados para minúsculas para corrigir o erro do ENUM.
        modalContent.innerHTML = `
            <h3>Adicionar Produto</h3>
            
            <label>Nome:</label>
            <input id="novo-nome" style="width:100%" placeholder="Ex: Caneta Azul">
            
            <label>Tipo:</label>
            <select id="novo-tipo" style="width:100%">
                <option value="consumo">Consumo (Material de Escritório, Limpeza...)</option>
                <option value="permanente">Permanente (Móveis, Eletrônicos...)</option>
                <option value="UNIFORMES ROUPAS">Uniformes Roupas</option>
                <option value="UNIFORMES CALÇADOS">Uniformes Calçados</option>
            </select>
            
            <label>Categoria:</label>
            <select id="novo-cat" style="width:100%">
                ${opcoesCategorias}
            </select>
            
            <label>Unidade de Medida:</label>
            <input id="novo-unid" placeholder="Ex: UN, CX, PCT, KG" style="width:100%">
            
            <label>Estoque Mínimo:</label>
            <input type="number" id="novo-min" value="0">
            
            <div style="margin-top:15px; text-align:right">
                <button class="btn-confirmar" onclick="window.salvarNovoProduto()">Salvar</button>
            </div>
        `;

    } catch (e) {
        console.error(e);
        modalContent.innerHTML = `<p style="color:red; padding:20px;">Erro ao carregar formulário: ${e.message}</p>`;
    }
}

window.salvarNovoProduto = async function() {
    // Pegamos os valores brutos dos inputs
    const nomeRaw = document.getElementById("novo-nome").value;
    const tipo = document.getElementById("novo-tipo").value; // Este valor DEVE ser minúsculo (vem do value do option)
    const catRaw = document.getElementById("novo-cat").value;
    const unidRaw = document.getElementById("novo-unid").value;
    const min = document.getElementById("novo-min").value;

    // Validações básicas
    if(!nomeRaw) return alert("Preencha o nome do produto.");
    if(!catRaw) return alert("Selecione uma categoria.");
    if(!unidRaw && tipo === 'consumo') return alert("Preencha a unidade de medida.");

    // --- AQUI ACONTECE A PADRONIZAÇÃO ---
    // Convertemos textos livres para Maiúsculo
    // Mantemos 'tipo' inalterado pois é um ENUM de controle do banco
    const payload = {
        nome: nomeRaw.toUpperCase(),            // Ex: "caneta" vira "CANETA"
        tipo: tipo,                             // Mantém "consumo" (minúsculo) para não dar erro no banco
        categoria: catRaw.toUpperCase(),        // Garante que a categoria salva no texto seja maiúscula
        unidade_medida: unidRaw ? unidRaw.toUpperCase() : null, // Ex: "un" vira "UN"
        estoque_minimo: parseInt(min) || 0,
        ativo: true 
    };

    try {
        const { data, error } = await supabase
            .from("catalogo")
            .insert([payload])
            .select()
            .single();

        if(error) throw error;

        // Se não for permanente, cria o registro na tabela de estoque
        if (tipo !== 'permanente') {
            await criarProdutoNoEstoque(data);
        }
        
        alert("Produto criado com sucesso!");
        window.closeModal();
        
        // Atualiza a tela
        if (typeof window.renderTab === 'function') window.renderTab('catalogo'); 
        
        // Atualiza a lista na config se estiver aberta
        const areaConfig = document.getElementById("config-content-area");
        if (areaConfig && areaConfig.offsetParent !== null) {
            window.navegarConfig('catalogo');
        }

    } catch (e) {
        alert("Erro ao salvar: " + e.message);
        console.error(e);
    }
}

window.deleteCatalogo = async function(id) {
    if(!confirm("Tem certeza? Isso apagará o item.")) return;
    // Validações de segurança omitidas para brevidade, mas devem existir
    const { error } = await supabase.from("catalogo").delete().eq("id", id);
    if(error) alert("Erro ao apagar: " + error.message);
    else window.navegarConfig('catalogo');
}

window.openModalAddCategoria = function() {
    const val = prompt("Nome da nova categoria:");
    if(val) {
        // Força maiúscula ao criar a categoria
        supabase.from("categorias")
            .insert([{ nome: val.toUpperCase() }]) 
            .then(({ error }) => {
                if(error) alert("Erro: " + error.message);
                else window.navegarConfig('categorias');
            });
    }
}

// --- NOVAS FUNÇÕES DE CONFIGURAÇÃO ---

// Correção Item D: Função que faltava para abrir modal de Locais (Unidades)
window.openModalCadastro = function(tipo) {
    if (tipo === 'unidades') {
        const modal = document.getElementById("global-modal");
        const content = document.getElementById("modal-content-area");
        
        content.innerHTML = `
            <h3>Nova Unidade / Local</h3>
            <label>Nome do Local:</label>
            <input type="text" id="nova-unidade-nome" placeholder="Ex: Almoxarifado Central">
            <label>Responsável (Opcional):</label>
            <input type="text" id="nova-unidade-resp">
            
            <div style="margin-top:15px; text-align:right">
                <button class="btn-confirmar" onclick="window.salvarNovaUnidade()">Salvar</button>
            </div>
        `;
        modal.style.display = 'block';
    }
    // Adicione outros 'else if' aqui se precisar usar essa função para outros cadastros
}

window.salvarNovaUnidade = async function() {
    const nome = document.getElementById("nova-unidade-nome").value;
    const resp = document.getElementById("nova-unidade-resp").value;
    
    if(!nome) return alert("O nome da unidade é obrigatório.");

    const { error } = await supabase.from("unidades").insert([{ nome: nome, responsavel: resp }]);
    
    if(error) alert("Erro ao salvar: " + error.message);
    else {
        alert("Local salvo com sucesso!");
        window.closeModal();
        window.navegarConfig('locais');
    }
}

// Para Item A: Alterar Senha
window.modalAlterarSenha = function() {
    const novaSenha = prompt("Digite a nova senha (mínimo 6 caracteres):");
    if(!novaSenha) return;
    if(novaSenha.length < 6) return alert("A senha deve ter pelo menos 6 caracteres.");

    // Atualiza a senha no Supabase Auth
    supabase.auth.updateUser({ password: novaSenha })
        .then(({ data, error }) => {
            if(error) alert("Erro ao alterar senha: " + error.message);
            else alert("Senha alterada com sucesso!");
        });
}

// Para Item B: Adicionar Tamanho Roupa
window.addTamanhoRoupa = async function() {
    // Usamos prompt simples para agilizar, mas poderia ser um modal customizado
    const tam = prompt("Digite a sigla do tamanho (Ex: G, GG):");
    if(!tam) return;
    const ordem = prompt("Digite a ordem de exibição (número inteiro, ex: 1, 2, 3):");
    if(!ordem) return;

    const { error } = await supabase.from("tamanhos_roupas").insert([{ 
        tamanho: tam.toUpperCase(), 
        ordem: parseInt(ordem) 
    }]);

    if(error) alert("Erro: " + error.message);
    else window.navegarConfig('tamanhos_roupas');
}

// Para Item C: Adicionar Tamanho Calçado
window.addTamanhoCalcado = async function() {
    const num = prompt("Digite o número (Ex: 38, 40):");
    if(!num) return;
    const ordem = prompt("Digite a ordem de exibição (número inteiro):");
    if(!ordem) return;

    const { error } = await supabase.from("tamanhos_calcados").insert([{ 
        numero: parseInt(num), 
        ordem: parseInt(ordem) 
    }]);

    if(error) alert("Erro: " + error.message);
    else window.navegarConfig('tamanhos_calcados');
}



window.deleteGeneric = async function(table, id) {
    if(confirm("Apagar item?")) {
        await supabase.from(table).delete().eq("id", id);
        // Recarrega a aba atual (simplificado)
        alert("Apagado.");
    }
}

// Lógica de sincronização com estoque
async function criarProdutoNoEstoque(produto) {
    // CORREÇÃO: Verifica se é 'consumo' (minúsculo) OU 'CONSUMO' (maiúsculo)
    if (produto.tipo === "consumo" || produto.tipo === "CONSUMO") {
        await supabase.from("estoque_consumo").insert([{ produto_id: produto.id, quantidade_atual: 0 }]);
    }
    // Para uniformes, cria a grade de tamanhos
    else if (produto.tipo === "UNIFORMES ROUPAS") {
        const { data: tams } = await supabase.from("tamanhos_roupas").select("*");
        if(tams) {
            for (let t of tams) {
                await supabase.from("estoque_tamanhos").insert([{ produto_id: produto.id, tamanho: t.tamanho, quantidade: 0 }]);
            }
        }
    }
    else if (produto.tipo === "UNIFORMES CALÇADOS") {
        const { data: nums } = await supabase.from("tamanhos_calcados").select("*");
        if(nums) {
            for (let n of nums) {
                await supabase.from("estoque_tamanhos").insert([{ produto_id: produto.id, tamanho: String(n.numero), quantidade: 0 }]);
            }
        }
    }
}

// ============================================================================
// PARTE 7: UNIFORMES ROUPAS
// ============================================================================

window.renderTabUniformesRoupas = async function () {
    const tab = document.getElementById("tab-content");

    // Estrutura inicial
    tab.innerHTML = `
        <div class="uniformes-container">
            <div class="uniformes-header">
                <h2><i class="fas fa-tshirt"></i> Uniformes — Roupas</h2>
            </div>
            <div style="overflow-x: auto;">
                <table class="uniformes-table data-table" id="table-roupas">
                    <thead id="thead-roupas"></thead>
                    <tbody id="tbody-roupas"></tbody>
                </table>
            </div>
        </div>
    `;

    const thead = document.getElementById("thead-roupas");
    const tbody = document.getElementById("tbody-roupas");

    const { data: produtos } = await supabase
        .from("catalogo")
        .select("*")
        .eq("tipo", "UNIFORMES ROUPAS")
        .order("nome");

    const { data: tamanhos } = await supabase
        .from("tamanhos_roupas")
        .select("*")
        .order("ordem");

    const { data: estoque } = await supabase
        .from("estoque_tamanhos")
        .select("*");

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="50">Nenhum uniforme cadastrado.</td></tr>`;
        return;
    }

    // ---------- CABEÇALHO ----------
    let headerRow1 = `<tr><th>TAMANHO</th>`;
    let headerRow2 = `<tr><th></th>`; // Totais

    produtos.forEach(p => {
        headerRow1 += `
            <th style="text-align:center;">
                ${p.nome}<br>
                <button onclick="window.modalMovimentoUniforme(${p.id}, 'entrada', 'roupas')" style="margin-right:5px;">
                    <i class="fas fa-plus"></i>
                </button>
                <button onclick="window.modalMovimentoUniforme(${p.id}, 'saida', 'roupas')">
                    <i class="fas fa-minus"></i>
                </button>
            </th>`;

        const estoqueProd = estoque.filter(e => e.produto_id === p.id);
        const totalProd = estoqueProd.reduce((s, x) => s + x.quantidade, 0);

        headerRow2 += `<th style="text-align:center; font-weight:bold;">${totalProd}</th>`;
    });

    headerRow1 += `</tr>`;
    headerRow2 += `</tr>`;

    thead.innerHTML = headerRow1 + headerRow2;

    // ---------- CORPO (Tamanhos x Produtos) ----------
    tamanhos.forEach(t => {
        let row = `<tr><td style="font-weight:bold;">${t.tamanho}</td>`;

        produtos.forEach(p => {
            const item = estoque.find(e => e.produto_id === p.id && e.tamanho === t.tamanho);
            row += `<td style="text-align:center;">${item ? item.quantidade : 0}</td>`;
        });

        row += `</tr>`;
        tbody.innerHTML += row;
    });
};

window.modalMovimentoUniforme = async function(prodId, tipo, categoria) {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");
    
    content.innerHTML = "<p>Carregando dados...</p>";
    modal.style.display = 'block';

    // Busca nome do produto
    const { data: p } = await supabase.from("catalogo").select("nome").eq("id", prodId).single();
    
    // Define lista de opções buscando do banco
    let opcoesHtml = "";
    
    if (categoria === 'roupas') {
        const { data: tRoupas } = await supabase.from("tamanhos_roupas").select("tamanho").order("ordem");
        if(tRoupas) {
            opcoesHtml = tRoupas.map(t => `<option value="${t.tamanho}">${t.tamanho}</option>`).join('');
        }
    } else {
        // Lógica para calçados
        const { data: tCalcados } = await supabase.from("tamanhos_calcados").select("numero").order("ordem");
        if(tCalcados) {
            opcoesHtml = tCalcados.map(t => `<option value="${t.numero}">${t.numero}</option>`).join('');
        }
    }

    content.innerHTML = `
        <h3>${tipo === 'entrada' ? 'Entrada' : 'Saída'}: ${p.nome}</h3>
        <label>Tamanho / Número:</label>
        <select id="uni-tam">
            ${opcoesHtml}
        </select>
        <label>Quantidade:</label>
        <input type="number" id="uni-qtd" value="1" min="1">
        <div style="margin-top:15px; text-align:right">
            <button class="btn-confirmar" onclick="window.confirmarMovimentoUniforme(${prodId}, '${tipo}', '${categoria}')">Confirmar</button>
        </div>
    `;
}

// --- FUNÇÃO ATUALIZADA: MOVIMENTO UNIFORME ---
window.confirmarMovimentoUniforme = async function(prodId, tipo, categoria) {
    const tam = document.getElementById("uni-tam").value;
    const qtd = parseInt(document.getElementById("uni-qtd").value);
    
    if(!qtd || qtd <= 0) return alert("Quantidade inválida");

    // Feedback visual imediato no botão
    const btn = document.querySelector('#modal-content-area .btn-confirmar');
    if(btn) {
        btn.innerText = "Salvando...";
        btn.disabled = true;
    }

    try {
        // Busca registro atual no estoque
        const { data: reg, error: errBusca } = await supabase.from("estoque_tamanhos")
            .select("*").eq("produto_id", prodId).eq("tamanho", tam).single();

        if(errBusca && errBusca.code !== 'PGRST116') throw errBusca; // Ignora erro se não encontrar (PGRST116)

        let novaQtd = 0;
        let atual = reg ? reg.quantidade : 0;

        if (tipo === 'entrada') {
            novaQtd = atual + qtd;
        } else {
            // Validação de Saída
            if (atual < qtd) {
                alert(`Saldo insuficiente! Atual: ${atual}, Tentativa: ${qtd}`);
                if(btn) { btn.innerText = "Confirmar"; btn.disabled = false; }
                return;
            }
            novaQtd = atual - qtd;
        }

        // Atualiza ou Insere no Estoque
        if (reg) {
            await supabase.from("estoque_tamanhos").update({ quantidade: novaQtd }).eq("id", reg.id);
        } else {
            if (tipo === 'saida') return alert("Item não existe no estoque para dar saída.");
            await supabase.from("estoque_tamanhos").insert({ produto_id: prodId, tamanho: tam, quantidade: novaQtd });
        }

        // Grava Histórico
        // Passamos 'null' explicitamente para unidadeId, pois uniforme não vai para uma unidade específica nessa tela
        await registrarHistorico(
            prodId, 
            qtd, 
            tipo + '_uniforme',  // Gera 'saida_uniforme' ou 'entrada_uniforme'
            `Tamanho: ${tam}`, 
            userProfile?.nome || 'Sistema',
            null // Unidade ID é Nulo aqui
        );

        alert("Movimentação realizada com sucesso!");
        window.closeModal();
        
        // Atualiza a aba correta
        if(categoria === 'roupas') window.renderTabUniformesRoupas();
        else window.renderTabUniformesCalcados();

    } catch (e) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
        if(btn) { btn.innerText = "Confirmar"; btn.disabled = false; }
    }
}

// ============================================================================
// PARTE 8: UNIFORMES CALÇADOS (ATUALIZADO)
// ============================================================================

window.renderTabUniformesCalcados = async function () {
    const tab = document.getElementById("tab-content");

    tab.innerHTML = `
        <div class="uniformes-container">
            <div class="uniformes-header">
                <h2><i class="fas fa-shoe-prints"></i> Uniformes — Calçados</h2>
            </div>
            <div id="calcados-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;"></div>
        </div>
    `;

    const grid = document.getElementById("calcados-grid");

    // Busca produtos do tipo 'UNIFORMES CALÇADOS', tamanhos e estoque
    const [{ data: produtos }, { data: tamanhos }, { data: estoque }] = await Promise.all([
        supabase.from("catalogo").select("*").eq("tipo", "UNIFORMES CALÇADOS").order("nome"),
        supabase.from("tamanhos_calcados").select("*").order("ordem"),
        supabase.from("estoque_tamanhos").select("*")
    ]);

    if (!produtos || produtos.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; padding:20px; background:#fff; border-radius:8px;">Nenhum calçado cadastrado.</div>`;
        return;
    }

    // Para cada produto, renderiza um 'card' apresentando os tamanhos divididos em 3 linhas
    for (const p of produtos) {
        // lista de tamanhos com quantidade para este produto
        const tList = tamanhos ? tamanhos.map(t => String(t.numero)) : [];
        // monta array de objetos {tamanho, quantidade}
        const tamanhoObjs = tList.map(tam => {
            const e = estoque ? estoque.find(s => s.produto_id === p.id && String(s.tamanho) === String(tam)) : null;
            return { tamanho: tam, qtd: e ? e.quantidade : 0 };
        });

        // divisão em 3 linhas
        const total = tamanhoObjs.length;
        const perCol = Math.ceil(total / 3);
        const rows = [ [], [], [] ];
        tamanhoObjs.forEach((it, idx) => {
            const colIndex = Math.floor(idx / perCol);
            rows[colIndex].push(it);
        });

        // total produto
        const totalProduto = tamanhoObjs.reduce((s, x) => s + (x.qtd || 0), 0);

        // HTML do card
        const card = document.createElement('div');
        card.style.background = '#fff';
        card.style.padding = '14px';
        card.style.borderRadius = '10px';
        card.style.boxShadow = '0 6px 14px rgba(0,0,0,0.04)';
        
        // AQUI ABAIXO: Alterado justify-content:space-between para justify-content:flex-start e adicionado gap
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:700; font-size:1rem;">${p.nome}</div>
                <div style="text-align:right; font-size:0.9rem;">
                    Total: <span style="font-weight:800;">${totalProduto}</span>
                    <div style="margin-top:6px;">
                        <button onclick="window.modalMovimentoUniforme(${p.id}, 'entrada', 'calcados')" style="margin-right:6px;" title="Entrada"><i class="fas fa-plus"></i></button>
                        <button onclick="window.modalMovimentoUniforme(${p.id}, 'saida', 'calcados')" title="Saída"><i class="fas fa-minus"></i></button>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:10px; align-items:flex-start;">
                <div style="flex:1;">
                    ${rows[0].map(r => `<div style="padding:6px 8px; border-radius:6px; margin-bottom:6px; background:#fbfbfd; display:flex; justify-content:flex-start; gap:20px;"><span>${r.tamanho}</span><strong>${r.qtd}</strong></div>`).join('')}
                </div>
                <div style="flex:1;">
                    ${rows[1].map(r => `<div style="padding:6px 8px; border-radius:6px; margin-bottom:6px; background:#fbfbfd; display:flex; justify-content:flex-start; gap:20px;"><span>${r.tamanho}</span><strong>${r.qtd}</strong></div>`).join('')}
                </div>
                <div style="flex:1;">
                    ${rows[2].map(r => `<div style="padding:6px 8px; border-radius:6px; margin-bottom:6px; background:#fbfbfd; display:flex; justify-content:flex-start; gap:20px;"><span>${r.tamanho}</span><strong>${r.qtd}</strong></div>`).join('')}
                </div>
            </div>
        `;
        grid.appendChild(card);
    }
};

// ============================================================================
// PARTE 9: MODAIS OPERACIONAIS GERAIS
// ============================================================================

window.openModalEntrada = async function(filtroTipo) {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");

    let query = supabase.from('catalogo').select('id, nome, tipo, unidade_medida').order('nome');
    if (filtroTipo) query = query.eq('tipo', filtroTipo);
    const { data: produtos } = await query;
    const { data: locais } = await supabase.from('unidades').select('*').order('nome');

    content.innerHTML = `
        <h3>Nova Entrada</h3>
        <label>Produto:</label>
        <select id="ent-prod">
            <option value="">Selecione</option>
            ${produtos.map(p => `<option value="${p.id}" data-tipo="${p.tipo}">${p.nome}</option>`).join('')}
        </select>
        
        <div id="area-extra"></div>
        
        <label>Quantidade:</label><input type="number" id="ent-qtd" value="1">
        <label>Local/Destino (Opcional):</label>
        <select id="ent-local"><option value="">Estoque Central</option>${locais.map(l=>`<option value="${l.id}">${l.nome}</option>`).join('')}</select>
        
        <label>Obs/Nota:</label><input type="text" id="ent-obs">

        <div style="margin-top:15px; text-align:right">
            <button class="btn-confirmar" onclick="window.confirmarEntradaGeral()">Confirmar</button>
        </div>
    `;
    modal.style.display = 'block';
}

// --- FUNÇÃO ATUALIZADA: CONFIRMAR ENTRADA GERAL ---
window.confirmarEntradaGeral = async function() {
    const prodSelect = document.getElementById("ent-prod");
    const prodId = prodSelect.value;
    
    // Pega o tipo e o nome
    const tipoRaw = prodSelect.options[prodSelect.selectedIndex].dataset.tipo;
    const nomeProd = prodSelect.options[prodSelect.selectedIndex].text;
    const tipo = tipoRaw ? tipoRaw.toUpperCase() : ''; 

    const qtd = parseInt(document.getElementById("ent-qtd").value);
    let local = document.getElementById("ent-local").value;
    const obs = document.getElementById("ent-obs").value;

    if(!prodId || qtd <= 0) return alert("Dados inválidos.");

    // Lógica CONSUMO (Agora gravando como MATERIAL no histórico)
    if(tipo === 'CONSUMO') {
        const { data: reg } = await supabase.from("estoque_consumo").select("*").eq("produto_id", prodId).single();
        if(reg) {
            await supabase.from("estoque_consumo").update({ quantidade_atual: reg.quantidade_atual + qtd }).eq("id", reg.id);
        } else {
            await supabase.from("estoque_consumo").insert({ produto_id: prodId, quantidade_atual: qtd });
        }
        
        // CORREÇÃO DE NOME: Usa 'ENTRADA_MATERIAL'
        await registrarHistorico(prodId, qtd, 'ENTRADA_MATERIAL', obs, userProfile?.nome, local);
        
        alert("Entrada de Material realizada!");
        window.closeModal();
        if(typeof activeTab !== 'undefined') window.renderTab(activeTab);
    }
    // Lógica Patrimônio
    else if(tipo === 'PERMANENTE') {
        window.closeModal();
        setTimeout(() => {
            window.abrirModalLotePatrimonio(prodId, nomeProd, qtd, local, obs);
        }, 300);
    }
    // Lógica Uniformes (Caso alguém use a entrada geral para uniformes)
    else {
        alert("Para uniformes, utilize a aba específica ou configure a entrada automática aqui.");
    }
}

// ============================================================================
// [NOVO] FUNÇÕES PARA ENTRADA EM LOTE DE PATRIMÔNIO
// ============================================================================

window.abrirModalLotePatrimonio = function(prodId, nomeProd, qtd, localId, obs) {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");
    
    // Gera os campos de input dinamicamente
    let inputsHtml = `<div style="max-height: 400px; overflow-y: auto; padding-right: 10px; margin-bottom: 20px;">`;
    
    for (let i = 1; i <= qtd; i++) {
        inputsHtml += `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <span style="font-weight: bold; color: #64748b; width: 30px;">#${i}</span>
                <div style="flex: 1;">
                    <label style="font-size: 0.8rem; display: block; margin-bottom: 2px;">Plaqueta / Nº Série</label>
                    <input type="text" class="input-lote-patrimonio" id="pat-input-${i}" placeholder="Digite ou bipe o código" style="width: 100%; margin: 0;">
                </div>
            </div>
        `;
    }
    inputsHtml += `</div>`;

    content.innerHTML = `
        <h3><i class="fas fa-boxes"></i> Entrada em Lote: Patrimônio</h3>
        <div style="background: #eff6ff; padding: 10px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #2563eb;">
            <strong>Produto:</strong> ${nomeProd}<br>
            <strong>Quantidade:</strong> ${qtd} itens<br>
            <small>Preencha os identificadores de cada item abaixo.</small>
        </div>
        
        <form id="form-lote-patrimonio" onsubmit="event.preventDefault(); window.salvarLotePatrimonio(${prodId}, ${qtd}, '${localId || ''}', '${obs || ''}')">
            ${inputsHtml}
            <div style="text-align: right; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                <button type="button" class="btn-cancelar" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="btn-confirmar">Salvar Todos</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    // Foca no primeiro input automaticamente
    setTimeout(() => {
        const primeiroInput = document.getElementById("pat-input-1");
        if(primeiroInput) primeiroInput.focus();
    }, 100);
}

window.salvarLotePatrimonio = async function(prodId, qtdTotal, localId, obs) {
    const inputs = document.querySelectorAll('.input-lote-patrimonio');
    const listaPlaquetas = [];
    let temVazio = false;

    // Coleta os valores
    inputs.forEach(input => {
        const val = input.value.trim();
        if(!val) temVazio = true;
        listaPlaquetas.push(val);
    });

    if(temVazio) {
        if(!confirm("Alguns itens estão sem número de plaqueta. Deseja continuar mesmo assim (ficarão sem código)?")) {
            return;
        }
    }

    // Feedback Visual
    const btn = document.querySelector('#form-lote-patrimonio button[type="submit"]');
    if(btn) {
        btn.innerText = "Salvando...";
        btn.disabled = true;
    }

    try {
        // Prepara o Array para Insert em Massa (Bulk Insert) - Muito mais rápido
        const payload = listaPlaquetas.map(plaqueta => ({
            produto_id: prodId,
            codigo_patrimonio: plaqueta || null, // Se vazio, envia null ou poderia gerar um provisório
            unidade_id: (localId && localId !== "null" && localId !== "") ? localId : null,
            inservivel: false,
            data_aquisicao: new Date().toISOString().split('T')[0] // Data de hoje
        }));

        const { error } = await supabase.from("patrimonio").insert(payload);
        
        if(error) throw error;

        // Registra Histórico (Apenas 1 registro global informando a entrada em massa)
        await registrarHistorico(
            prodId, 
            qtdTotal, 
            'entrada', 
            `Entrada em Lote (${qtdTotal} un). ${obs}`, 
            userProfile?.nome, 
            (localId && localId !== "null" && localId !== "") ? localId : null
        );

        alert("Todos os itens foram cadastrados com sucesso!");
        window.closeModal();
        
        // Atualiza a tela se estiver na aba patrimônio
        if(typeof activeTab !== 'undefined' && activeTab === 'patrimonio') {
            window.renderTab('patrimonio');
        } else {
            // Se estiver em outra aba, força ir para patrimônio para ver o resultado
            const btnPat = document.querySelector(`.tab-button[data-tab="patrimonio"]`);
            if(btnPat) btnPat.click();
        }

    } catch (e) {
        console.error(e);
        alert("Erro ao salvar lote: " + e.message);
        if(btn) {
            btn.innerText = "Salvar Todos";
            btn.disabled = false;
        }
    }
}

window.openModalSaidaRapida = async function() {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");
    
    // Busca itens com saldo > 0
    const { data: itens } = await supabase.from("estoque_consumo")
        .select("id, quantidade_atual, catalogo(nome, id)").gt("quantidade_atual", 0);

    content.innerHTML = `
        <h3>Saída Rápida (Consumo)</h3>
        <label>Item:</label>
        <select id="sai-id">
            ${itens.map(i => `<option value="${i.id}" data-prod="${i.catalogo.id}">${i.catalogo.nome} (Saldo: ${i.quantidade_atual})</option>`).join('')}
        </select>
        <label>Quantidade:</label><input type="number" id="sai-qtd" value="1">
        <label>Responsável/Setor:</label><input type="text" id="sai-resp">
        <div style="margin-top:15px; text-align:right">
            <button class="btn-confirmar" onclick="window.confirmarSaidaRapida()">Baixar</button>
        </div>
    `;
    modal.style.display = 'block';
}

window.confirmarSaidaRapida = async function() {
    const idEstoque = document.getElementById("sai-id").value;
    const select = document.getElementById("sai-id");
    const prodId = select.options[select.selectedIndex].dataset.prod;
    const qtd = parseInt(document.getElementById("sai-qtd").value);
    
    // [CORREÇÃO] Captura o input para usar na observação, mantendo o usuário logado como responsável
    const infoDestino = document.getElementById("sai-resp").value;
    const usuarioLogado = userProfile?.nome || 'Usuário';
    
    // Se houver texto no input, adiciona aos detalhes. Se não, mantém apenas "Saída Rápida".
    const observacaoFinal = infoDestino ? `Saída Rápida: ${infoDestino}` : 'Saída Rápida';

    if(!qtd || qtd <= 0) return alert("Quantidade inválida.");

    const { data: item } = await supabase.from("estoque_consumo").select("quantidade_atual").eq("id", idEstoque).single();
    
    if(!item || item.quantidade_atual < qtd) return alert("Saldo insuficiente.");

    await supabase.from("estoque_consumo").update({ quantidade_atual: item.quantidade_atual - qtd }).eq("id", idEstoque);
    
    // [CORREÇÃO] Ordem corrigida: (prodId, qtd, tipo, OBSERVACAO, RESPONSAVEL)
    await registrarHistorico(prodId, qtd, 'SAIDA_MATERIAL', observacaoFinal, usuarioLogado);
    
    alert("Saída registrada.");
    window.closeModal();
    window.renderTab("estoque_consumo");
}

window.openModalMovimentarPatrimonio = async function () {
    if (!selectedRowId) {
        alert("Selecione um item do patrimônio primeiro.");
        return;
    }

    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");

    // Busca item selecionado (incluindo nome do local atual)
    const { data: item, error: errItem } = await supabase
        .from("patrimonio")
        .select("id, codigo_patrimonio, catalogo(nome), unidade_id, unidades:unidade_id(nome)")
        .eq("id", selectedRowId)
        .single();

    if (errItem || !item) {
        console.error("Erro ao buscar patrimônio:", errItem);
        alert("Erro ao carregar os dados do item. Veja console.");
        return;
    }

    // Busca todos os locais/unidades (sem filtro "ativo" pois a coluna pode não existir)
    const { data: locais, error: errLocais } = await supabase
        .from("unidades")
        .select("id, nome")
        .order("nome");

    if (errLocais || !locais) {
        console.error("Erro ao buscar locais:", errLocais);
        alert("Erro ao carregar os locais. Veja console.");
        return;
    }

    content.innerHTML = `
        <h3>Movimentar Patrimônio</h3>

        <label>Item:</label>
        <input type="text" disabled value="${(item.codigo_patrimonio || '')} - ${(item.catalogo?.nome || '')}">

        <label>Local atual:</label>
        <input type="text" disabled value="${item.unidades?.nome || 'Sem Local'}">

        <label>Novo local:</label>
        <select id="mov-pat-dest">
            <option value="">Selecione...</option>
            ${locais.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
        </select>

        <label>Motivo (opcional):</label>
        <input id="mov-pat-motivo" type="text" placeholder="Motivo da movimentação (opcional)">

        <div style="text-align:right; margin-top:10px;">
            <button class="btn-cancelar" onclick="window.closeModal()">Cancelar</button>
            <button class="btn-confirmar" onclick="window.confirmarMovPatrimonio()">Mover</button>
        </div>
    `;

    modal.style.display = "block";
};

window.confirmarMovPatrimonio = async function () {
    if (!selectedRowId) {
        alert("Nenhum item selecionado.");
        return;
    }

    const dest = document.getElementById("mov-pat-dest")?.value;
    const motivo = document.getElementById("mov-pat-motivo")?.value || "Movimentação de patrimônio";

    if (!dest) return alert("Selecione o novo local.");

    try {
        // [Modificação] Buscamos também produto_id e codigo_patrimonio para o histórico global
        const { data: atual, error: errAtual } = await supabase
            .from("patrimonio")
            .select("unidade_id, produto_id, codigo_patrimonio") 
            .eq("id", selectedRowId)
            .single();

        if (errAtual) throw errAtual;

        const localAnterior = atual?.unidade_id || null;
        const prodId = atual?.produto_id;
        const plaqueta = atual?.codigo_patrimonio;

        // 1) Atualiza o patrimônio (Local novo)
        const { error: errUpdate } = await supabase
            .from("patrimonio")
            .update({ unidade_id: dest })
            .eq("id", selectedRowId);

        if (errUpdate) throw errUpdate;

        // 2) Insere no historico_patrimonio (Específico)
        await supabase.from("historico_patrimonio").insert([{
            patrimonio_id: selectedRowId,
            local_anterior_id: localAnterior,
            local_novo_id: dest,
            data_movimentacao: new Date().toISOString(),
            responsavel_id: currentUserId || null,
            motivo: motivo
        }]);

        // 3) [NOVO] Insere no Histórico Global (Demanda 1)
        // Registra a movimentação na aba 'Histórico'
        await registrarHistorico(
            prodId, 
            1, // Quantidade é sempre 1 para patrimônio individual
            'MOVIMENTACAO_PATRIMONIO', 
            `Plaqueta: ${plaqueta}. Motivo: ${motivo}`, 
            userProfile?.nome || 'Sistema',
            dest // ID da unidade de destino
        );

        alert("Movimentação registrada com sucesso!");
        window.closeModal();
        window.renderTab("patrimonio");

    } catch (e) {
        console.error("Erro em confirmarMovPatrimonio:", e);
        alert("Erro ao movimentar: " + e.message);
    }
};

// PEDIDOS
// 1. Abrir Modal de Criação (Permite selecionar vários itens)
window.openModalCriarPedido = async function() {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");
    
    // Reseta lista temporária
    itensPedidoTemporario = [];

    content.innerHTML = '<p style="padding:20px; text-align:center;">Carregando produtos e locais...</p>';
    modal.style.display = 'block';

    try {
        const { data: locais } = await supabase.from('unidades').select('*').order('nome');
        
        // Busca todos os produtos ativos que não são permanentes
        const { data: produtos, error } = await supabase.from('catalogo')
            .select('*')
            .neq('tipo', 'permanente') 
            .eq('ativo', true)
            .order('nome');

        if (error) throw error;

        // SEPARAÇÃO DOS PRODUTOS EM ARRAYS
        const roupas = produtos.filter(p => p.tipo === 'UNIFORMES ROUPAS');
        const calcados = produtos.filter(p => p.tipo === 'UNIFORMES CALÇADOS');
        // Filtra tanto maiúsculo quanto minúsculo para garantir
        const materiais = produtos.filter(p => p.tipo === 'CONSUMO' || p.tipo === 'consumo');

        let html = `
            <h3><i class="fas fa-cart-plus"></i> Novo Pedido de Saída</h3>
            
            <div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0;">
                <label><strong>1. Destino da Mercadoria:</strong></label>
                <select id="ped-destino" style="width:100%; margin-bottom:0;">
                    <option value="">Selecione o Local / Unidade...</option>
                    ${locais.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
                </select>
            </div>

            <div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">
                
                <div class="pedido-section" style="border: 1px solid #bae6fd; background: #f0f9ff; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                    <h4 style="margin-top:0; color: #0284c7;"><i class="fas fa-tshirt"></i> 1. Uniformes - Roupas</h4>
                    <div style="display:flex; gap:5px; align-items:flex-end;">
                        <div style="flex:3;">
                            <small>Produto:</small>
                            <select id="sel-roupa-prod" onchange="window.verificarEstoqueSimples('roupa')" style="width:100%; margin-bottom:0">
                                <option value="">Selecione a Roupa...</option>
                                ${roupas.map(p => `<option value="${p.id}" data-nome="${p.nome}">${p.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:1.5;">
                            <small>Tam:</small>
                            <select id="sel-roupa-tam" style="width:100%; margin-bottom:0">
                                <option value="">-</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <small>Qtd:</small>
                            <input type="number" id="qtd-roupa" min="1" placeholder="0" style="margin-bottom:0">
                        </div>
                        <button onclick="window.adicionarItemAoPedido('roupa')" style="background:#0284c7; color:white; height:38px; width:40px;"><i class="fas fa-plus"></i></button>
                    </div>
                    <small id="msg-estoque-roupa" style="color:#64748b; font-weight:bold; display:block; margin-top:5px;">Estoque: -</small>
                </div>

                <div class="pedido-section" style="border: 1px solid #cbd5e1; background: #f1f5f9; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                    <h4 style="margin-top:0; color: #475569;"><i class="fas fa-shoe-prints"></i> 2. Uniformes - Calçados</h4>
                    <div style="display:flex; gap:5px; align-items:flex-end;">
                        <div style="flex:3;">
                            <small>Produto:</small>
                            <select id="sel-calcado-prod" onchange="window.verificarEstoqueSimples('calcado')" style="width:100%; margin-bottom:0">
                                <option value="">Selecione o Calçado...</option>
                                ${calcados.map(p => `<option value="${p.id}" data-nome="${p.nome}">${p.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:1.5;">
                            <small>Num:</small>
                            <select id="sel-calcado-tam" style="width:100%; margin-bottom:0">
                                <option value="">-</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <small>Qtd:</small>
                            <input type="number" id="qtd-calcado" min="1" placeholder="0" style="margin-bottom:0">
                        </div>
                        <button onclick="window.adicionarItemAoPedido('calcado')" style="background:#475569; color:white; height:38px; width:40px;"><i class="fas fa-plus"></i></button>
                    </div>
                    <small id="msg-estoque-calcado" style="color:#64748b; font-weight:bold; display:block; margin-top:5px;">Estoque: -</small>
                </div>

                <div class="pedido-section" style="border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                    <h4 style="margin-top:0; color: #15803d;"><i class="fas fa-box-open"></i> 3. Material de Consumo</h4>
                    <div style="display:flex; gap:5px; align-items:flex-end;">
                        <div style="flex:4;">
                            <small>Produto:</small>
                            <select id="sel-consumo-prod" onchange="window.verificarEstoqueSimples('consumo')" style="width:100%; margin-bottom:0">
                                <option value="">Selecione o Material...</option>
                                ${materiais.map(p => `<option value="${p.id}" data-nome="${p.nome}">${p.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:1;">
                            <small>Qtd:</small>
                            <input type="number" id="qtd-consumo" min="1" placeholder="0" style="margin-bottom:0">
                        </div>
                        <button onclick="window.adicionarItemAoPedido('consumo')" style="background:#15803d; color:white; height:38px; width:40px;"><i class="fas fa-plus"></i></button>
                    </div>
                    <small id="msg-estoque-consumo" style="color:#64748b; font-weight:bold; display:block; margin-top:5px;">Estoque: -</small>
                </div>

            </div>

            <div style="margin-top:15px;">
                <table class="data-table" style="font-size:0.9em;">
                    <thead><tr><th>Produto</th><th>Tam/Num</th><th>Qtd</th><th>Ação</th></tr></thead>
                    <tbody id="lista-itens-pedido">
                        <tr><td colspan="4" style="text-align:center; color:#999;">Nenhum item adicionado.</td></tr>
                    </tbody>
                </table>
            </div>

            <div style="margin-top:20px; text-align:right; border-top:1px solid #eee; padding-top:10px;">
                <button class="btn-cancelar" onclick="window.closeModal()" style="margin-right:10px;">Cancelar</button>
                <button class="btn-confirmar" onclick="window.salvarPedidoCompleto()">Confirmar Pedido</button>
            </div>
        `;
        content.innerHTML = html;
    } catch (error) {
        console.error(error); 
        content.innerHTML = `<p style="color:red; padding:20px; text-align:center">Erro ao carregar dados: ${error.message}</p>`;
    }
}

// Função Auxiliar para verificar estoque e preencher tamanhos dinamicamente
window.verificarEstoqueSimples = async function(tipo) {
    const prodSelect = document.getElementById(`sel-${tipo}-prod`);
    const prodId = prodSelect.value;
    const msgElement = document.getElementById(`msg-estoque-${tipo}`);
    
    if (!prodId) {
        msgElement.innerText = "Estoque: -";
        return;
    }

    msgElement.innerText = "Verificando...";

    if (tipo === 'consumo') {
        // Lógica Consumo (sem tamanho)
        const { data } = await supabase.from('estoque_consumo').select('quantidade_atual').eq('produto_id', prodId).single();
        const qtd = data ? data.quantidade_atual : 0;
        msgElement.innerText = `Disponível: ${qtd}`;
        prodSelect.dataset.max = qtd;
    } 
    else {
        // Lógica Roupas ou Calçados (com tamanho)
        const tamSelect = document.getElementById(`sel-${tipo}-tam`);
        tamSelect.innerHTML = '<option value="">Carregando...</option>';
        
        const { data: tams } = await supabase.from('estoque_tamanhos')
            .select('tamanho, quantidade')
            .eq('produto_id', prodId)
            // Se quiser ordenar tamanhos, pode precisar de logica extra, aqui ordena pela criação ou string
            .order('id'); 
            
        if (tams && tams.length > 0) {
            tamSelect.innerHTML = '<option value="">Sel.</option>';
            tams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tamanho;
                opt.text = `${t.tamanho} (Disp: ${t.quantidade})`;
                opt.dataset.qtd = t.quantidade;
                tamSelect.appendChild(opt);
            });
            msgElement.innerText = "Selecione o tamanho.";
            
            // Evento ao mudar o tamanho para atualizar max
            tamSelect.onchange = function() {
                const q = this.options[this.selectedIndex].dataset.qtd || 0;
                msgElement.innerText = `Disponível neste tamanho: ${q}`;
            };
        } else {
            tamSelect.innerHTML = '<option value="">Sem estoque</option>';
            msgElement.innerText = "Sem grade cadastrada.";
        }
    }
}

// Função unificada para adicionar itens das 3 seções
window.adicionarItemAoPedido = function(tipo) {
    const prodSelect = document.getElementById(`sel-${tipo}-prod`);
    const qtdInput = document.getElementById(`qtd-${tipo}`);
    const prodId = prodSelect.value;
    const prodNome = prodSelect.options[prodSelect.selectedIndex]?.dataset.nome;
    const qtd = parseInt(qtdInput.value);
    
    let tamanho = null;
    let estoqueMax = 0;

    if (!prodId) return alert("Selecione um produto.");
    if (!qtd || qtd <= 0) return alert("Quantidade inválida.");

    if (tipo === 'consumo') {
        estoqueMax = parseInt(prodSelect.dataset.max) || 0;
    } else {
        const tamSelect = document.getElementById(`sel-${tipo}-tam`);
        tamanho = tamSelect.value;
        if (!tamanho) return alert("Selecione o tamanho/número.");
        estoqueMax = parseInt(tamSelect.options[tamSelect.selectedIndex].dataset.qtd) || 0;
    }

    if (qtd > estoqueMax) return alert(`Quantidade indisponível! Máximo: ${estoqueMax}`);

    // Adiciona ao array global
    itensPedidoTemporario.push({
        produto_id: prodId,
        nome: prodNome,
        tipo_interno: tipo, // 'roupa', 'calcado', 'consumo'
        tipo_produto: (tipo === 'consumo' ? 'CONSUMO' : 'UNIFORME'), // Para controle de baixa
        tamanho: tamanho,
        quantidade: qtd
    });

    renderizarListaItensPedido();
    
    // Limpa campos para nova inserção
    qtdInput.value = "";
    if(tipo !== 'consumo') document.getElementById(`sel-${tipo}-tam`).value = "";
    document.getElementById(`msg-estoque-${tipo}`).innerText = "Item adicionado.";
}

// Renderização da tabela permanece a mesma
function renderizarListaItensPedido() {
    const tbody = document.getElementById("lista-itens-pedido");
    if (itensPedidoTemporario.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Nenhum item.</td></tr>';
        return;
    }
    
    let html = "";
    itensPedidoTemporario.forEach((item, index) => {
        html += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.tamanho || '-'}</td>
                <td>${item.quantidade}</td>
                <td><button class="btn-cancelar" onclick="removerItemLista(${index})" style="padding:2px 8px;">X</button></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.removerItemLista = function(index) {
    itensPedidoTemporario.splice(index, 1);
    renderizarListaItensPedido();
}

// Auxiliar: Verifica se precisa mostrar select de tamanho e busca estoque
window.verificarOpcoesProduto = async function() {
    const select = document.getElementById("ped-prod-select");
    const option = select.options[select.selectedIndex];
    const tipo = option.dataset.tipo;
    const prodId = select.value;
    
    const selTam = document.getElementById("ped-tam-select");
    const msgEstoque = document.getElementById("ped-estoque-msg");

    if (!prodId) return;

    msgEstoque.innerText = "Verificando estoque...";
    selTam.innerHTML = '<option value="">Tam.</option>';

    if (tipo === 'CONSUMO') {
        selTam.style.display = 'none';
        const { data } = await supabase.from('estoque_consumo').select('quantidade_atual').eq('produto_id', prodId).single();
        const qtd = data ? data.quantidade_atual : 0;
        msgEstoque.innerText = `Estoque disponível: ${qtd}`;
        select.dataset.estoque = qtd; // Guarda no elemento para validação
    } 
    else {
        // Uniformes
        selTam.style.display = 'block';
        const { data: tams } = await supabase.from('estoque_tamanhos').select('tamanho, quantidade').eq('produto_id', prodId);
        
        if (tams && tams.length > 0) {
            msgEstoque.innerText = "Selecione o tamanho para ver o estoque.";
            tams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tamanho;
                opt.text = t.tamanho;
                opt.dataset.qtd = t.quantidade;
                selTam.appendChild(opt);
            });
            
            // Evento ao mudar tamanho
            selTam.onchange = function() {
                const q = this.options[this.selectedIndex].dataset.qtd || 0;
                msgEstoque.innerText = `Estoque disponível (Tam ${this.value}): ${q}`;
                select.dataset.estoque = q;
            };
        } else {
            msgEstoque.innerText = "Sem estoque cadastrado.";
        }
    }
}

// Auxiliar: Adiciona item no array temporário
window.adicionarItemLista = function() {
    const prodSelect = document.getElementById("ped-prod-select");
    const tamSelect = document.getElementById("ped-tam-select");
    const qtdInput = document.getElementById("ped-qtd-input");
    
    const prodId = prodSelect.value;
    const prodNome = prodSelect.options[prodSelect.selectedIndex]?.dataset.nome;
    const tipo = prodSelect.options[prodSelect.selectedIndex]?.dataset.tipo;
    const tamanho = (tipo !== 'CONSUMO') ? tamSelect.value : null;
    const estoqueMax = parseInt(prodSelect.dataset.estoque) || 0;
    const qtd = parseInt(qtdInput.value);

    if (!prodId) return alert("Selecione um produto.");
    if (tipo !== 'CONSUMO' && !tamanho) return alert("Selecione o tamanho.");
    if (!qtd || qtd <= 0) return alert("Quantidade inválida.");
    if (qtd > estoqueMax) return alert(`Quantidade indisponível! Máximo: ${estoqueMax}`);

    // Adiciona ao array global
    itensPedidoTemporario.push({
        produto_id: prodId,
        nome: prodNome,
        tipo: tipo,
        tamanho: tamanho,
        quantidade: qtd
    });

    renderizarListaItensPedido();
    
    // Limpa campos
    qtdInput.value = "";
    document.getElementById("ped-estoque-msg").innerText = "Item adicionado.";
}


// 2. Função Principal: Salva Pedido, Baixa Estoque e Gera PDF
window.salvarPedidoCompleto = async function() {
    const destinoSelect = document.getElementById("ped-destino");
    const destinoId = destinoSelect.value;
    const destinoNome = destinoSelect.options[destinoSelect.selectedIndex].text;
    
    if (!destinoId) return alert("Selecione o Local de destino.");
    if (itensPedidoTemporario.length === 0) return alert("Adicione pelo menos um item ao pedido.");

    if (!confirm("Confirma o pedido? O estoque será baixado automaticamente.")) return;

    const btnConfirmar = document.querySelector('.btn-confirmar');
    btnConfirmar.innerText = "Processando...";
    btnConfirmar.disabled = true;

    try {
        // --- CORREÇÃO AQUI: STATUS MINÚSCULO ---
        // Alterado de 'PENDENTE' para 'pendente'
        const { data: pedido, error: errPed } = await supabase
            .from('pedidos')
            .insert([{ 
                unidade_destino_id: destinoId, 
                status: 'pendente', // <--- AQUI ESTAVA O ERRO DO ENUM
                data_solicitacao: new Date(),
                solicitante_id: currentUserId 
            }])
            .select()
            .single();

        if (errPed) throw errPed;

        // B. Loop dos Itens
        for (const item of itensPedidoTemporario) {
            
            // Salva na tabela itens_pedido
            await supabase.from('itens_pedido').insert({
                pedido_id: pedido.id,
                produto_id: item.produto_id,
                quantidade_solicitada: item.quantidade, 
                tamanho: item.tamanho, 
            });

            // Baixa do Estoque
            if (item.tipo_interno === 'consumo') {
                const { data: est } = await supabase.from('estoque_consumo').select('*').eq('produto_id', item.produto_id).single();
                if (est) {
                    await supabase.from('estoque_consumo')
                        .update({ quantidade_atual: est.quantidade_atual - item.quantidade })
                        .eq('id', est.id);
                }
            } else {
                // Uniformes (Roupas ou Calçados)
                const { data: est } = await supabase.from('estoque_tamanhos')
                    .select('*')
                    .eq('produto_id', item.produto_id)
                    .eq('tamanho', item.tamanho)
                    .single();
                if (est) {
                    await supabase.from('estoque_tamanhos')
                        .update({ quantidade: est.quantidade - item.quantidade })
                        .eq('id', est.id);
                }
            }

            // Histórico
            await registrarHistorico(
                item.produto_id, 
                item.quantidade, 
                'SAIDA_PEDIDO', 
                `Pedido #${pedido.id} para ${destinoNome}`, 
                userProfile?.nome,
                destinoId
            );
        }

        // Gera o PDF (A função gerarPDFPedido deve permanecer no script original, não precisa alterar)
        await gerarPDFPedido(pedido.id, destinoNome, itensPedidoTemporario);

        alert("Pedido criado com sucesso! O PDF foi baixado.");
        window.closeModal();
        window.renderTab('pedidos');

    } catch (error) {
        console.error(error);
        alert("Erro ao salvar pedido: " + error.message);
    } finally {
        if(btnConfirmar) {
            btnConfirmar.innerText = "Confirmar Pedido";
            btnConfirmar.disabled = false;
        }
    }
}

// 3. Função para Gerar PDF (Folha A4)
window.gerarPDFPedido = async function(pedidoId, destino, itens) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(18);
    doc.text(`PEDIDO DE SAÍDA Nº ${pedidoId}`, 105, 20, null, null, "center");
    
    doc.setFontSize(12);
    doc.text(`Data: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30);
    doc.text(`Destino: ${destino}`, 14, 38);
    doc.text(`Responsável Emissão: ${userProfile?.nome || 'Sistema'}`, 14, 46);

    // Dados da Tabela
    const tableData = itens.map(item => [
        item.nome,
        item.tamanho || '-',
        item.tipo === 'CONSUMO' ? 'Material' : 'Uniforme',
        item.quantidade
    ]);

    // Gera Tabela
    doc.autoTable({
        startY: 55,
        head: [['Produto', 'Tamanho', 'Tipo', 'Qtd']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] } // Azul do sistema
    });

    // Área de Assinatura no Rodapé
    const finalY = doc.lastAutoTable.finalY + 40; // 40px abaixo da tabela
    
    doc.line(20, finalY, 190, finalY); // Linha horizontal
    doc.setFontSize(10);
    doc.text(`Recebido por (Nome Legível): __________________________________________________`, 20, finalY + 10);
    doc.text(`Assinatura e Data: __________________________________________________________`, 20, finalY + 20);

    // Salva o arquivo
    doc.save(`Pedido_${pedidoId}_${destino.replace(/\s+/g, '_')}.pdf`);
}

// 4. Gerenciar Pedido (Atualizar Status com Bloqueios)
window.openModalGerenciarPedido = async function(pedidoId) {
    const modal = document.getElementById("global-modal");
    const content = document.getElementById("modal-content-area");
    
    content.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Carregando pedido...</div>';
    modal.style.display = 'block';

    try {
        // 1) Busca dados do Pedido
        const { data: pedido, error: errPed } = await supabase
            .from('pedidos')
            .select('*, unidades(nome)')
            .eq('id', pedidoId)
            .single();
        if (errPed) throw errPed;

        // 2) Busca itens do pedido incluindo quantidade_atendida (se existir)
        // Tentamos selecionar quantidade_atendida; se não existir, a query retorna sem ela
        const { data: itensRaw, error: errItens } = await supabase
            .from('itens_pedido')
            .select('id, produto_id, quantidade_solicitada, quantidade_atendida, tamanho, catalogo(id, nome, tipo)')
            .eq('pedido_id', pedidoId);
        if (errItens) throw errItens;

        // Monta HTML dos itens com checkbox e input de quantidade a enviar
        let htmlItens = `<table class="table-geral" style="width:100%; margin-bottom:12px;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="width:6%"></th>
                    <th>Produto</th>
                    <th>Tipo</th>
                    <th>Tam/Num</th>
                    <th>Solicitado</th>
                    <th>Atendido</th>
                    <th>Enviar neste lote</th>
                </tr>
            </thead>
            <tbody>`;

        const itens = itensRaw || [];
        if (itens.length === 0) {
            htmlItens += `<tr><td colspan="7" style="text-align:center">Nenhum item neste pedido.</td></tr>`;
        } else {
            itens.forEach(it => {
                const nomeProd = it.catalogo ? it.catalogo.nome : '(Produto removido)';
                const tipo = it.catalogo ? it.catalogo.tipo : '-';
                const solicitado = parseInt(it.quantidade_solicitada) || 0;
                const atendido = parseInt(it.quantidade_atendida) || 0;
                const restante = Math.max(0, solicitado - atendido);
                // linha com checkbox + quantidade
                htmlItens += `<tr data-item-id="${it.id}" data-prod-id="${it.produto_id}" data-tipo="${tipo}" data-tamanho="${it.tamanho || ''}">
                    <td style="text-align:center"><input type="checkbox" class="env-checkbox" data-item="${it.id}"></td>
                    <td>${nomeProd}</td>
                    <td>${tipo}</td>
                    <td>${it.tamanho || '-'}</td>
                    <td style="font-weight:700; text-align:center">${solicitado}</td>
                    <td style="font-weight:700; text-align:center" id="atendido-${it.id}">${atendido}</td>
                    <td style="text-align:center;">
                        <input type="number" class="env-qtd" id="envq-${it.id}" value="${restante>0?restante:0}" min="0" max="${restante}" style="width:80px; padding:6px; border-radius:6px; border:1px solid #ddd;">
                        <div style="font-size:0.85em; color:#666;">rest: ${restante}</div>
                    </td>
                </tr>`;
            });
        }
        htmlItens += `</tbody></table>`;

        // Área volumes (oculta até ser preenchida)
        const areaVolumes = `
            <div id="area-volumes" style="display:none; margin-top:10px;">
                <label style="font-weight:700;">Quantidade de volumes:</label>
                <input type="number" id="num-volumes" value="1" min="1" style="width:80px; margin-left:8px;">
                <button class="btn-confirmar" style="margin-left:10px;" onclick="window.abrirVolumesUI(${pedidoId}, '${pedido.unidades?.nome || ''}')">Confirmar Volumes</button>
            </div>
        `;

        // Ações: Enviar lote parcial / Atualizar status / Reimprimir PDF
        const areaAcoes = `
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
                <button class="btn-confirmar" onclick="window.processarEnvioParcial(${pedidoId})"><i class="fas fa-truck"></i> Enviar Lote Selecionado</button>
                <button onclick="document.getElementById('area-volumes').style.display='block';" class="btn-confirmar" style="background:#64748b;"><i class="fas fa-boxes"></i> Informar Volumes / Imprimir</button>
                <button onclick="window.reimprimirPDF(${pedidoId}, '${pedido.unidades?.nome || ''}')" style="background:#64748b; color:white; border:none; padding:8px 12px; border-radius:6px;">
                    <i class="fas fa-print"></i> Re-imprimir Pedido (PDF)
                </button>
                <button onclick="window.gerarRelatorioPendencias(${pedidoId})" 
                    style="background:#1e293b; color:white; padding:8px 12px; border-radius:6px;">
                    <i class="fas fa-list"></i> Pendências
                </button>
            </div>
        `;

        // Monta modal completo
        content.innerHTML = `
            <h3><i class="fas fa-edit"></i> Gerenciar Pedido #${pedido.id}</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div><strong>Destino:</strong><br> ${pedido.unidades?.nome || 'N/A'}</div>
                <div><strong>Data:</strong><br> ${new Date(pedido.data_solicitacao).toLocaleString()}</div>
                <div><strong>Solicitante ID:</strong><br> ${pedido.solicitante_id || 'Sistema'}</div>
                <div><strong>Status:</strong><br> <span style="font-weight:700">${pedido.status}</span></div>
            </div>

            <h4>Itens do Pedido</h4>
            ${htmlItens}
            <div id="area-volumes-wrapper">${areaVolumes}</div>
            ${areaAcoes}
            <div id="volumes-ui-area" style="margin-top:14px;"></div>
        `;

    } catch (error) {
        console.error(error);
        content.innerHTML = `<p style="color:red; text-align:center;">Erro ao carregar detalhes do pedido:<br>${error.message}</p>`;
    }
};

// === Adicionar window.processarEnvioParcial ===
window.processarEnvioParcial = async function(pedidoId) {
    try {
        // coleta os itens marcados
        const checkboxes = Array.from(document.querySelectorAll('.env-checkbox')).filter(cb => cb.checked);
        if (checkboxes.length === 0) return alert("Marque ao menos um item para enviar neste lote.");

        // opcional: quantidade de volumes já informada (se o usuário abriu a área)
        const numVolumesInput = document.getElementById('num-volumes');
        const numVolumes = numVolumesInput ? parseInt(numVolumesInput.value) || 0 : 0;

        // 1) Garantir coluna quantidade_atendida existe (tenta criar somente se ausente)
        // Nota: operação DDL via Supabase pode requerer privilégio; se falhar o catch exibe no console.
        try {
            await supabase.rpc('dummy'); // chamada nula para manter fluxo; (laço para forçar execução em alguns ambientes)
        } catch (e) {
            // ignore
        }
        // Observação: se preferir criar a coluna manualmente, comente o bloco abaixo.
        try {
            await supabase.from('itens_pedido').select('quantidade_atendida').limit(1);
        } catch (errField) {
            // tenta criar a coluna (pode falhar se permissões ausentes)
            try {
                await supabase.rpc('sql', { q: "ALTER TABLE itens_pedido ADD COLUMN quantidade_atendida integer DEFAULT 0" });
            } catch (ddlErr) {
                // Não crítico: seguiremos assumindo que campo pode não existir, usaremos update parcial via insert fallback
                console.warn("Não foi possível verificar/criar campo quantidade_atendida automaticamente.", ddlErr);
            }
        }

        // 2) Monta lista de envios
        const envios = [];
        for (const cb of checkboxes) {
            const itemId = cb.dataset.item;
            const qtdInput = document.getElementById(`envq-${itemId}`);
            if (!qtdInput) continue;
            const qtdEnviar = parseInt(qtdInput.value) || 0;
            if (qtdEnviar <= 0) continue;

            // Buscar dados atuais do item (para validar max)
            const { data: itemDb } = await supabase.from('itens_pedido').select('id, pedido_id, produto_id, quantidade_solicitada, quantidade_atendida, tamanho').eq('id', itemId).single();
            if (!itemDb) continue;
            const atendido = parseInt(itemDb.quantidade_atendida) || 0;
            const solicitado = parseInt(itemDb.quantidade_solicitada) || 0;
            const maxDisponivel = Math.max(0, solicitado - atendido);
            if (qtdEnviar > maxDisponivel) return alert(`Quantidade a enviar maior que restante para o item ${itemDb.id}. Restante: ${maxDisponivel}`);
            envios.push({ itemId: itemDb.id, produto_id: itemDb.produto_id, qtdEnviar, tamanho: itemDb.tamanho });
        }

        if (envios.length === 0) return alert("Nenhum item válido para envio.");

        // 3) Processa cada envio: atualiza quantidade_atendida e baixa estoque
        for (const ev of envios) {
            // a) Atualiza quantidade_atendida (somando)
            // Fazemos SELECT para garantir valor atual
            const { data: ip, error: ipErr } = await supabase.from('itens_pedido').select('quantidade_atendida, quantidade_solicitada').eq('id', ev.itemId).single();
            if (ipErr) console.error(ipErr);
            const atualAtendido = ip && ip.quantidade_atendida ? parseInt(ip.quantidade_atendida) : 0;
            const novoAtendido = atualAtendido + ev.qtdEnviar;

            // Atualiza no DB (se coluna existir)
            try {
                await supabase.from('itens_pedido').update({ quantidade_atendida: novoAtendido }).eq('id', ev.itemId);
            } catch (e) {
                console.warn("Falha ao atualizar quantidade_atendida (pode ser campo inexistente):", e);
            }

            // b) Baixa do estoque
            // detecta se é consumo ou uniforme (via catalogo tipo)
            // busca o tipo do produto
            const { data: prod } = await supabase.from('catalogo').select('tipo').eq('id', ev.produto_id).single();
            const tipoProd = prod ? prod.tipo : null;

            if (String(tipoProd).toUpperCase() === 'CONSUMO' || String(tipoProd).toLowerCase() === 'consumo') {
                // estoque_consumo
                const { data: est } = await supabase.from('estoque_consumo').select('*').eq('produto_id', ev.produto_id).single();
                if (est) {
                    const novaQtd = (est.quantidade_atual || 0) - ev.qtdEnviar;
                    await supabase.from('estoque_consumo').update({ quantidade_atual: novaQtd }).eq('id', est.id);
                }
            } else {
                // estoque_tamanhos
                const { data: est } = await supabase.from('estoque_tamanhos').select('*').eq('produto_id', ev.produto_id).eq('tamanho', ev.tamanho).single();
                if (est) {
                    const novaQtd = (est.quantidade || 0) - ev.qtdEnviar;
                    await supabase.from('estoque_tamanhos').update({ quantidade: novaQtd }).eq('id', est.id);
                }
            }

            // c) Registra no histórico global para cada item enviado (tipo 'Envio Pedido')
            await registrarHistorico(ev.produto_id, ev.qtdEnviar, 'Envio Pedido', `Pedido #${pedidoId} - Lote parcial`, userProfile?.nome, null);
        }

        // 4) Se informou número de volumes, registra no histórico e abre UI de volumes (para imprimir)
        if (numVolumes && numVolumes > 0) {
            // registra como histórico resumido do envio do lote
            await registrarHistorico(null, envios.reduce((s,x)=>s+x.qtdEnviar,0), 'Envio Pedido', `Pedido #${pedidoId} - Enviado (Volumes: ${numVolumes})`, userProfile?.nome, null);
            // Mostra interface de volumes
            window.abrirVolumesUI(pedidoId, (document.querySelector('#area-volumes-wrapper input#num-volumes') ? document.querySelector('#area-volumes-wrapper input#num-volumes').value : numVolumes));
        } else {
            alert("Lote enviado com sucesso.");
            window.closeModal();
            window.renderTab('pedidos');
        }

    // === Atualização automática do status do pedido ===
    const { data: itensAtualizados } = await supabase
        .from('itens_pedido')
        .select('quantidade_solicitada, quantidade_atendida')
        .eq('pedido_id', pedidoId);

    let totalSolicitado = 0;
    let totalAtendido = 0;

    itensAtualizados.forEach(it => {
        totalSolicitado += parseInt(it.quantidade_solicitada || 0);
        totalAtendido   += parseInt(it.quantidade_atendida || 0);
    });

    let novoStatus = "Parcialmente Enviado";

    if (totalAtendido >= totalSolicitado) {
        novoStatus = "Finalizado";
    }

    await supabase
        .from('pedidos')
        .update({ status: novoStatus })
        .eq('id', pedidoId);


    } catch (err) {
        console.error("Erro em processarEnvioParcial:", err);
        alert("Erro ao processar lote: " + (err.message || err));
    }
};

// === Adicionar UI de volumes e função de impressão ===
window.abrirVolumesUI = function(pedidoId, destinoNome) {
    const wrapper = document.getElementById('volumes-ui-area');
    const nInput = document.getElementById('num-volumes');
    const n = nInput ? parseInt(nInput.value) || 1 : 1;
    wrapper.innerHTML = ''; // limpa

    let html = `<h4>Volumes (${n}) - Observações (não serão gravadas)</h4>`;
    for (let i = 1; i <= n; i++) {
        html += `
            <div style="background:#fff; padding:10px; border-radius:8px; margin-bottom:8px; box-shadow:0 4px 10px rgba(0,0,0,0.04);">
                <label style="font-weight:700;">Observações Volume ${i} / ${n}:</label>
                <textarea id="obs-volume-${i}" rows="4" style="width:100%; padding:8px; margin-top:6px;"></textarea>
            </div>
        `;
    }

    html += `<div style="text-align:right; margin-top:8px;">
                <button class="btn-confirmar" onclick="window.imprimirVolumes(${pedidoId}, '${destinoNome}', ${n})"><i class="fas fa-print"></i> Imprimir Volumes (2 cópias por volume)</button>
                <button class="btn-cancelar" style="margin-left:8px;" onclick="document.getElementById('volumes-ui-area').innerHTML=''">Cancelar</button>
             </div>`;

    wrapper.innerHTML = html;
    // rolagem leve
    wrapper.scrollIntoView({ behavior: 'smooth' });
};

window.imprimirVolumes = function(pedidoId, destinoNome, numVolumes) {
    // Monta HTML para impressão: cada volume 2 páginas idênticas (duas cópias)
    const printable = [];
    for (let i = 1; i <= numVolumes; i++) {
        const obs = (document.getElementById(`obs-volume-${i}`) || {}).value || '';
        const header = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <div></div>
            <div style="font-weight:800; font-size:18px;">VOLUME: ${i}/${numVolumes}</div>
        </div>`;
        const meta = `<div style="margin-top:10px;">Destino: <strong>${destinoNome}</strong><br>Data/Hora: <strong>${new Date().toLocaleString()}</strong></div>`;
        const body = `<div style="margin-top:18px; min-height:420px;">${obs.replace(/\n/g, '<br>')}</div>`;
        const footer = `<div style="position:relative; margin-top:20px;">
            <div style="width:48%; display:inline-block; border-top:1px solid #000; padding-top:6px;">Conferente (Assinatura)</div>
            <div style="width:48%; display:inline-block; text-align:right; border-top:1px solid #000; padding-top:6px;">Nº Matrícula</div>
        </div>`;

        const page = `<div class="print-page" style="page-break-after:always; padding:20px; font-family:Arial,Helvetica,sans-serif;">
            ${header}
            ${meta}
            ${body}
            ${footer}
        </div>`;

        // adiciona 2 cópias (duas páginas)
        printable.push(page);
        printable.push(page);
    }

    // cria janela de impressão
    const win = window.open('', '_blank');
    if (!win) return alert("Bloqueador de popups impediu a abertura da janela de impressão. Permita popups e tente novamente.");

    const htmlDoc = `
        <html>
            <head>
                <title>Volumes - Pedido ${pedidoId}</title>
                <style>
                    @media print {
                        @page { size: A4; margin: 20mm; }
                        body { -webkit-print-color-adjust: exact; }
                    }
                    body { margin:0; padding:0; font-size:14px; color:#111; }
                    .print-page { width:210mm; min-height:297mm; box-sizing:border-box; }
                </style>
            </head>
            <body>
                ${printable.join('')}
                <script>
                    // auto print then close
                    window.onload = function() {
                        setTimeout(() => { window.print(); /* não fechar automaticamente para permitir visualização */ }, 300);
                    }
                </script>
            </body>
        </html>
    `;
    win.document.open();
    win.document.write(htmlDoc);
    win.document.close();

    // após imprimir, registrar no histórico o envio global com número de volumes
    registrarHistorico(null, 0, "Envio Pedido", `Impressão de etiquetas do Pedido #${pedidoId}`, userProfile?.nome, null, numVolumes);
 
    alert("Janela de impressão aberta. Verifique sua impressora e confirme a impressão.");
};

window.atualizarStatusPeloSelect = async function(pedidoId) {
    const select = document.getElementById("novo-status-selecionado");
    const novoStatus = select.value;

    if(!novoStatus) return;

    if(!confirm(`Deseja alterar o status para "${novoStatus}"?`)) return;

    // Feedback visual
    const btnSalvar = document.querySelector('#modal-content-area .btn-confirmar');
    const textoOriginal = btnSalvar ? btnSalvar.innerText : 'Salvar';
    if(btnSalvar) {
        btnSalvar.innerText = "Processando...";
        btnSalvar.disabled = true;
    }

    try {
        // --- MUDANÇA AQUI: Usamos maybeSingle() ---
        const { data, error } = await supabase
            .from('pedidos')
            .update({ status: novoStatus })
            .eq('id', pedidoId)
            .select('id, unidade_destino_id') 
            .maybeSingle(); // Retorna null em vez de erro se não atualizar nada

        if (error) throw error;

        // Se data for null, significa que o RLS bloqueou ou o ID não existe
        if (!data) {
            alert("PERMISSÃO NEGADA: O banco de dados recusou a atualização.\n\nVerifique se existe uma Policy (RLS) no Supabase permitindo UPDATE na tabela 'pedidos' para este usuário.");
            return; // Para aqui
        }

        // Se chegou aqui, atualizou com sucesso. Grava histórico:
        await registrarHistorico(
            null, 
            0, 
            'RECEBIMENTO_PEDIDO', 
            `Status alterado para: ${novoStatus.toUpperCase()}. Pedido #${pedidoId}`, 
            userProfile?.nome || 'Usuário',
            data.unidade_destino_id 
        );

        alert("Sucesso! Status atualizado.");
        window.closeModal();
        window.renderTab('pedidos');

    } catch (e) {
        console.error(e);
        alert("Erro técnico: " + e.message);
    } finally {
        if(btnSalvar) {
            btnSalvar.innerText = textoOriginal;
            btnSalvar.disabled = false;
        }
    }
}

// Função auxiliar para re-imprimir o PDF de um pedido antigo
window.reimprimirPDF = async function(pedidoId, destinoNome) {
    try {
        // Feedback visual
        const btnPrint = document.querySelector('button[onclick*="reimprimirPDF"]');
        if(btnPrint) btnPrint.innerText = "Gerando PDF...";

        // Busca itens novamente com segurança
        const { data: itens, error } = await supabase
            .from('itens_pedido')
            .select('quantidade_solicitada, tamanho, catalogo(nome, tipo)')
            .eq('pedido_id', pedidoId);
            
        if(error) throw error;
        if(!itens || itens.length === 0) return alert("Não há itens neste pedido para imprimir.");
        
        // Mapeia e trata possíveis nulos
        const itensFormatados = itens.map(i => ({
            nome: i.catalogo ? i.catalogo.nome : '(Produto Removido)',
            tamanho: i.tamanho,
            tipo: i.catalogo ? i.catalogo.tipo : 'N/A',
            quantidade: i.quantidade_solicitada
        }));
        
        // Chama a função original de gerar PDF (que já existe no seu código)
        await gerarPDFPedido(pedidoId, destinoNome, itensFormatados);

    } catch (e) {
        console.error(e);
        alert("Erro ao gerar PDF: " + e.message);
    } finally {
        const btnPrint = document.querySelector('button[onclick*="reimprimirPDF"]');
        if(btnPrint) btnPrint.innerHTML = '<i class="fas fa-print"></i> Re-imprimir PDF';
    }
}

window.alterarStatusPedido = async function(id, novoStatus) {
    if(!confirm(`Mudar status para ${novoStatus}?`)) return;
    
    // Proteção extra contra voltar para PENDENTE
    if (novoStatus === 'PENDENTE') return alert("Não é permitido voltar para o status Pendente.");

    const { error } = await supabase.from('pedidos').update({ status: novoStatus }).eq('id', id);
    if(error) alert("Erro: " + error.message);
    else {
        window.closeModal();
        window.renderTab('pedidos');
    }
}

// Função Especial: Cancelar e Devolver Estoque
window.cancelarPedido = async function(pedidoId) {
    if(!confirm("Tem certeza que deseja CANCELAR? Os itens voltarão para o estoque.")) return;

    // 1. Busca os itens para devolver
    const { data: itens } = await supabase.from('itens_pedido').select('*').eq('pedido_id', pedidoId);

    // 2. Loop de devolução
    for (const item of itens) {
        if (item.tipo_produto === 'CONSUMO') {
             // Devolve Consumo (Usa rpc seria melhor para concorrência, mas update funciona aqui)
             const { data: est } = await supabase.from('estoque_consumo').select('*').eq('produto_id', item.produto_id).single();
             if(est) {
                 await supabase.from('estoque_consumo').update({ quantidade_atual: est.quantidade_atual + item.quantidade }).eq('id', est.id);
             }
        } else {
             // Devolve Uniforme
             const { data: est } = await supabase.from('estoque_tamanhos').select('*').eq('produto_id', item.produto_id).eq('tamanho', item.tamanho).single();
             if(est) {
                 await supabase.from('estoque_tamanhos').update({ quantidade: est.quantidade + item.quantidade }).eq('id', est.id);
             }
        }
        
        // Log de retorno
        await registrarHistorico(item.produto_id, item.quantidade, 'ENTRADA_PEDIDO', `Cancelamento Pedido #${pedidoId}`, userProfile?.nome);
    }

    // 3. Atualiza status para CANCELADO
    await supabase.from('pedidos').update({ status: 'CANCELADO' }).eq('id', pedidoId);

    alert("Pedido cancelado e estoque estornado.");
    window.closeModal();
    window.renderTab('pedidos');
}

// ============================================================================
// PARTE 10: RECURSOS EXTRAS (RELATÓRIOS E CALCULADORA)
// ============================================================================

window.renderCalculadora = function() {
    const area = document.getElementById("tab-content");
    area.innerHTML = `
        <div style="max-width: 400px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h3>Calculadora de Caixas</h3>
            <label>Quantidade Total:</label>
            <input type="number" id="calc-total" style="width:100%; padding:10px; margin-bottom:10px;">
            <label>Itens por Caixa:</label>
            <input type="number" id="calc-div" style="width:100%; padding:10px; margin-bottom:10px;">
            <button class="btn-confirmar" onclick="window.calcularCaixas()" style="width:100%">Calcular</button>
            <div id="calc-res" style="margin-top:20px; font-weight:bold; color: #007bff;"></div>
        </div>
    `;
}

window.calcularCaixas = function() {
    const total = parseInt(document.getElementById("calc-total").value);
    const div = parseInt(document.getElementById("calc-div").value);
    if(!total || !div) return;
    
    const caixas = Math.floor(total / div);
    const sobra = total % div;
    
    document.getElementById("calc-res").innerHTML = 
        `Resultado: ${caixas} caixas fechadas + ${sobra} unidades soltas.`;
}

window.renderMenuRelatorios = function() {
    const area = document.getElementById("tab-content");
    area.innerHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap; justify-content:center; padding:20px;">
            <div class="card-relatorio" style="background:white; padding:20px; border-radius:8px; width:200px; text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:30px; color:orange"></i>
                <h4>Estoque Baixo</h4>
                <button onclick="window.gerarRelatorioPDF('baixo')">Gerar PDF</button>
            </div>
            <div class="card-relatorio" style="background:white; padding:20px; border-radius:8px; width:200px; text-align:center;">
                <i class="fas fa-history" style="font-size:30px; color:blue"></i>
                <h4>Movimentações</h4>
                <button onclick="alert('Funcionalidade de PDF requer biblioteca jsPDF')">Gerar PDF</button>
            </div>
        </div>
    `;
}

window.gerarRelatorioPendencias = async function(pedidoId) {
    const { data: itens } = await supabase
        .from('itens_pedido')
        .select('id, produto_id, tamanho, quantidade_solicitada, quantidade_atendida, catalogo(nome)')
        .eq('pedido_id', pedidoId);

    if (!itens || itens.length === 0) {
        alert("Nenhum item encontrado para este pedido.");
        return;
    }

    let tabela = `
        <h2>Relatório de Pendências do Pedido #${pedidoId}</h2>
        <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width:100%;">
            <tr style="background:#f1f5f9;">
                <th>Produto</th>
                <th>Tamanho</th>
                <th>Solicitado</th>
                <th>Atendido</th>
                <th>Pendente</th>
            </tr>
    `;

    itens.forEach(it => {
        const s = parseInt(it.quantidade_solicitada || 0);
        const a = parseInt(it.quantidade_atendida || 0);
        const r = s - a;

        tabela += `
            <tr>
                <td>${it.catalogo?.nome || ""}</td>
                <td>${it.tamanho || ""}</td>
                <td style="text-align:center;">${s}</td>
                <td style="text-align:center;">${a}</td>
                <td style="text-align:center; font-weight:700; color:${r>0?'red':'green'};">${r}</td>
            </tr>
        `;
    });

    tabela += "</table>";

    const win = window.open("", "_blank");
    win.document.write(`
        <html>
        <head>
            <title>Pendências Pedido ${pedidoId}</title>
        </head>
        <body style="font-family: Arial; padding:20px;">
            ${tabela}
        </body>
        </html>
    `);
    win.document.close();
};

window.gerarRelatorioPDF = async function(tipo) {
    // Exemplo simples usando window.print para evitar dependência complexa agora
    if(tipo === 'baixo') {
        const { data } = await supabase.from("estoque_consumo").select("quantidade_atual, catalogo(nome, estoque_minimo)");
        const baixos = data.filter(i => i.quantidade_atual <= i.catalogo.estoque_minimo);
        
        let texto = "RELATÓRIO DE ESTOQUE BAIXO:\n\n";
        baixos.forEach(b => texto += `- ${b.catalogo.nome}: Atual ${b.quantidade_atual} (Mín: ${b.catalogo.estoque_minimo})\n`);
        
        alert(texto);
        // Numa versão futura, integrar com jsPDF
    }
}

// Fim do Script
console.log("Sistema carregado com sucesso (v2.0 Refatorado)");



