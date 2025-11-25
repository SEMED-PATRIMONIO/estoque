// --- DADOS DE CONEXÃO SUPABASE ---
const SUPABASE_URL = 'https://ligndfhjxgbjiswemkku.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpZ25kZmhqeGdiamlzd2Vta2t1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTU5MTcsImV4cCI6MjA3OTE3MTkxN30.IuvFV1eb489ApmbTJCWuaDfdd5H0i81FeP3gKS30Ik8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ESTADO GLOBAL ---
let userProfile = null; 
let currentUserId = null;
let activeTab = 'catalogo';
let selectedRowId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Referências DOM
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const btnConfig = document.getElementById('btn-config');

    if(btnConfig) {
      btnConfig.addEventListener('click', async () => {
        // iremos renderizar as abas de Configurações dentro do modal (reaproveita renderTable)
        modalContentArea.innerHTML = '<h3><i class="fas fa-cog"></i> Configurações</h3><div id="config-tabs" style="display:flex; gap:8px; margin-bottom:12px;"><button class="cfg-btn" data-cfg="catalogo">Catálogo</button><button class="cfg-btn" data-cfg="unidades">Locais</button><button class="cfg-btn" data-cfg="categorias">Categorias</button><button class="cfg-btn" data-cfg="usuarios">Usuários</button></div><div id="config-area">Carregando...</div><div style="margin-top:12px;"><button class="btn-cancelar" onclick="closeModal()">Fechar</button></div>';
        modal.style.display = 'block';

        // attach events
        document.querySelectorAll('.cfg-btn').forEach(b => b.addEventListener('click', async (e) => {
          const cfg = e.target.dataset.cfg;
          // reutiliza renderTable: chamamos as queries diretamente aqui
          const container = document.getElementById('config-area');
          container.innerHTML = '<div style="padding:20px;">Carregando...</div>';
          try {
            if(cfg === 'catalogo') {
              const { data } = await supabase.from('catalogo').select('*').order('nome');
              container.innerHTML = renderTable('catalogo', data);
            } else if(cfg === 'unidades') {
              const { data } = await supabase.from('unidades').select('*').order('nome');
              container.innerHTML = renderTable('unidades', data);
            } else if(cfg === 'categorias') {
              const { data } = await supabase.from('categorias').select('*').order('nome');
              container.innerHTML = renderTable('categorias', data);
            } else if(cfg === 'usuarios') {
              const { data } = await supabase.from('usuarios').select('*').order('nome_completo');
              container.innerHTML = renderTable('usuarios', data);
            }
          } catch(err) { container.innerHTML = '<p style="color:red;">Erro ao carregar</p>'; console.error(err); }
        }));
      });
    }
    const tabsContainer = document.getElementById('tabs');
    const tabContentArea = document.getElementById('tab-content');
    const modal = document.getElementById('global-modal');
    const modalContentArea = document.getElementById('modal-content-area');

    // --- LOGIN ---
    btnLogin.addEventListener('click', async () => {
        const email = document.getElementById('login-usuario').value.trim();
        const senha = document.getElementById('login-senha').value.trim();
        if (!email || !senha) return alert('Preencha email e senha.');
        try {
            const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password: senha });
            if (error) throw error;
            currentUserId = authData.user.id;
            await loadUserProfile(currentUserId);
            loginScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            renderTab(activeTab);
        } catch (e) {
            console.error(e); alert('Erro login: ' + e.message);
        }
    });

    if(btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut(); window.location.reload();
        });
    }

    async function loadUserProfile(uid) {
        const { data, error } = await supabase.from('usuarios').select('nivel_acesso').eq('id', uid).single();
        userProfile = (error || !data) ? 'comum' : data.nivel_acesso;
        configureInterfaceByProfile();
    }

    function configureInterfaceByProfile() {
        const tabUsuarios = document.querySelector('.tab-button[data-tab="usuarios"]');
        if (tabUsuarios) {
            if (userProfile === 'comum') tabUsuarios.classList.add('hidden');
            else tabUsuarios.classList.remove('hidden');
        }
    }

    // --- NAVEGAÇÃO ---
    tabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-button');
        if (btn) {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            selectedRowId = null;
            renderTab(activeTab);
        }
    });

    // --- FUNÇÃO CENTRAL DE HISTÓRICO ---
    async function registrarHistorico(prodId, qtd, tipo, obs, respNome, unidId = null) {
        const destino = unidId ? unidId : null;
        const { error } = await supabase.from('historico_global').insert([{
            produto_id: prodId,
            quantidade: qtd,
            tipo_movimento: tipo,
            observacao: obs,
            responsavel_nome: respNome,
            usuario_sistema: currentUserId,
            unidade_destino_id: destino,
            data_movimentacao: new Date()
        }]);
        if(error) console.error("Erro ao gravar histórico:", error);
    }

    // --- RENDERIZAÇÃO ---
    async function renderTab(tabName) {
        if (tabName === 'calculadora') { renderCalculadora(); return; }
        if (tabName === 'relatorios') { renderMenuRelatorios(); return; }

        tabContentArea.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
        let data = [];
        let html = '';

        try {

            if (tabName === 'catalogo') {
                const { data: res } = await supabase.from('catalogo').select('*').order('nome');
                data = res;
            }

            else if (tabName === 'estoque_consumo') {
                // não deve ser mais chamado pela UI, mantido por compatibilidade
                const { data: res } = await supabase.from('estoque_consumo')
                    .select('id, quantidade_atual, local_fisico, catalogo(nome, unidade_medida, estoque_minimo, categoria)')
                    .order('id');
                if (res) {
                    data = res.sort((a, b) =>
                        (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || '')
                    );
                }
            }

            else if (tabName === 'historico') {
                const { data: res } = await supabase.from('historico_global')
                    .select('id, data_movimentacao, tipo_movimento, quantidade, responsavel_nome, observacao, catalogo(nome, categoria, unidade_medida), unidades!unidade_destino_id(nome)')
                    .order('data_movimentacao', { ascending: false })
                    .limit(50);
                data = res;
            }

            else if (tabName === 'material') {
                // Consumo EXCETO UNIFORMES
                const { data: res } = await supabase.from('estoque_consumo')
                    .select('id, quantidade_atual, local_fisico, catalogo(nome, unidade_medida, estoque_minimo, categoria)')
                    .order('id');

                if (res) {
                    data = res
                        .filter(r => (r.catalogo?.categoria || '').toUpperCase() !== 'UNIFORMES ESCOLARES')
                        .sort((a, b) =>
                            (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || '')
                        );
                }
            }

            else if (tabName === 'uniformes') {
                // Somente UNIFORMES
                const { data: res } = await supabase.from('estoque_consumo')
                    .select('id, quantidade_atual, local_fisico, catalogo(id, nome, unidade_medida, estoque_minimo, categoria, tipo)')
                    .order('id');

                if (res) {
                    data = res
                        .filter(r => (r.catalogo?.categoria || '').toUpperCase() === 'UNIFORMES ESCOLARES')
                        .sort((a, b) =>
                            (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || '')
                        );
                }
            }

            else if (tabName === 'patrimonio') {
                const { data: res } = await supabase.from('patrimonio')
                    .select('id, codigo_patrimonio, estado_conservacao, inservivel, catalogo(nome), unidades:unidade_id(nome)');

                if (res) {
                    data = res.sort((a, b) =>
                        (a.catalogo?.nome || '').localeCompare(b.catalogo?.nome || '')
                    );
                }
            }

            else if (tabName === 'pedidos') {
                const { data: res } = await supabase.from('pedidos')
                    .select('id, status, data_solicitacao, unidades(nome)')
                    .order('data_solicitacao', { ascending: false });
                data = res;
            }

            else if (tabName === 'unidades') {
                const { data: res } = await supabase.from('unidades')
                    .select('*')
                    .order('nome');
                data = res;
            }

            else if (tabName === 'categorias') {
                const { data: res } = await supabase.from('categorias')
                    .select('*')
                    .order('nome');
                data = res;
            }

            else if (tabName === 'usuarios') {
                const { data: res } = await supabase.from('usuarios')
                    .select('*')
                    .order('nome_completo');
                data = res;
            }

            // renderização final
            html += renderActionButtons(tabName);
            html += renderTable(tabName, data);
            tabContentArea.innerHTML = html;
            setupTableEvents(tabName);

        } catch (error) {
            console.error(error);
            tabContentArea.innerHTML = `<p style="color:red">Erro: ${error.message}</p>`;
        }
    }

    function renderActionButtons(tabName) {
        const isAdmin = ['admin', 'super'].includes(userProfile);
        let btns = '<div class="action-buttons">';

        if (isAdmin) {
            if (tabName === 'catalogo') {
                btns += `<button id="btn-novo-item"><i class="fas fa-plus"></i> Cadastrar Item</button>`;
                btns += `<button id="btn-entrada-geral" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Nova Entrada</button>`;
            }
            if (tabName === 'material') {
                btns += `<button id="btn-entrada-consumo" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Entrada (Material)</button>`;
                btns += `<button id="btn-saida-rapida" style="background-color: #ffc107; color: #333;"><i class="fas fa-arrow-up"></i> Saída Rápida</button>`;
            }
            if (tabName === 'uniformes') {
                // entrada/saída por grade
                btns += `<button id="btn-entrada-uniforme" style="background-color:#28a745;"><i class="fas fa-arrow-down"></i> Entrada (Grade)</button>`;
                btns += `<button id="btn-saida-uniforme" style="background-color:#ffc107; color:#333;"><i class="fas fa-arrow-up"></i> Saída (Grade)</button>`;
            }
            if (tabName === 'estoque_consumo') {
                btns += `<button id="btn-entrada-consumo" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Entrada Consumo</button>`;
                btns += `<button id="btn-saida-rapida" style="background-color: #ffc107; color: #333;"><i class="fas fa-arrow-up"></i> Saída Rápida</button>`;
            }
            if (tabName === 'patrimonio') {
                btns += `<button id="btn-entrada-patrimonio" style="background-color: #28a745;"><i class="fas fa-arrow-down"></i> Entrada Patrimônio</button>`;
                btns += `<button id="btn-movimentar-patrimonio" style="background-color: #17a2b8; color: white;"><i class="fas fa-exchange-alt"></i> Movimentar</button>`;
                btns += `<button id="btn-marcar-inservivel" style="background-color: #343a40; color: white;"><i class="fas fa-trash-alt"></i> Baixar (Inservível)</button>`;
            }
            if (tabName === 'unidades') btns += `<button id="btn-nova-unidade"><i class="fas fa-building"></i> Nova Unidade</button>`;

            if (tabName === 'categorias') btns += `<button id="btn-nova-categoria"><i class="fas fa-tags"></i> Nova Categoria</button>`;
        }
        
        if (tabName === 'pedidos') {
            btns += `<button id="btn-ver-pedido"><i class="fas fa-eye"></i> Gerenciar Pedido</button>`;
            if (isAdmin) btns += `<button id="btn-novo-pedido"><i class="fas fa-cart-plus"></i> Criar Pedido (Admin)</button>`;
        }
        
        if (userProfile === 'super' || (isAdmin && tabName === 'categorias')) {
             btns += `<button id="btn-apagar" class="btn-apagar-super"><i class="fas fa-trash"></i> Apagar Selecionado</button>`;
        }

        btns += '</div>';
        return btns;
    }

    function renderTable(tabName, data) {
        if (!data || data.length === 0) return '<p class="no-data">Nenhum registro encontrado.</p>';
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
            headers = ['Data', 'Tipo', 'Item', 'Categoria', 'Qtd', 'Detalhes'];
            data.forEach(r => {
                const dt = new Date(r.data_movimentacao).toLocaleString();
                const cat = r.catalogo?.categoria || '-';
                let tipoClass = 'status-tag ';
                if(r.tipo_movimento.includes('entrada')) tipoClass += 'conservacao-novo';
                else if(r.tipo_movimento.includes('saida') || r.tipo_movimento.includes('descarte')) tipoClass += 'conservacao-danificado';
                else tipoClass += 'conservacao-regular';
                
                const responsavelExterno = r.responsavel_nome ? `Resp: ${r.responsavel_nome}` : '';

                rows += `<tr>
                    <td style="font-size:0.85em;">${dt}</td>
                    <td><span class="${tipoClass}">${r.tipo_movimento.toUpperCase()}</span></td>
                    <td>${r.catalogo?.nome}</td>
                    <td>${cat}</td>
                    <td style="font-weight:bold;">${r.quantidade} ${r.catalogo?.unidade_medida||''}</td>
                    <td style="font-size:0.9em;">${r.observacao || ''} <br> <small style="color:#666;">${responsavelExterno}</small></td>
                </tr>`;
            });
        }
        else if (tabName === 'pedidos') {
            headers = ['ID', 'Destino', 'Data', 'Status'];
            data.forEach(r => {
                rows += `<tr data-id="${r.id}"><td>#${r.id}</td><td>${r.unidades?.nome}</td><td>${new Date(r.data_solicitacao).toLocaleDateString()}</td><td><span class="status-tag status-${r.status}">${r.status.toUpperCase()}</span></td></tr>`;
            });
        }
        else if (tabName === 'patrimonio') {
            headers = ['Plaqueta', 'Item', 'Local Atual', 'Conservação'];
            data.forEach(r => { 
                const local = r.unidades?.nome || '<span style="color:red">Sem Local</span>';
                // LÓGICA DO INSERVÍVEL
                let estadoDisplay = r.estado_conservacao;
                let styleClass = '';
                if (r.inservivel) {
                    estadoDisplay = 'INSERVÍVEL (DESCARTE)';
                    styleClass = 'background-color: #343a40; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.85em;';
                }
                
                rows += `<tr data-id="${r.id}"><td>${r.codigo_patrimonio}</td><td>${r.catalogo?.nome}</td><td>${local}</td><td><span style="${styleClass}">${estadoDisplay}</span></td></tr>`; 
            });
        }
        else if (tabName === 'unidades') {
             headers = ['Nome', 'Responsável', 'Status'];
             data.forEach(r => { rows += `<tr data-id="${r.id}"><td>${r.nome}</td><td>${r.responsavel||'-'}</td><td>${r.status}</td></tr>`; });
        }
        else if (tabName === 'categorias') {
             headers = ['Nome da Categoria']; 
             data.forEach(r => { rows += `<tr data-id="${r.id}"><td>${r.nome}</td></tr>`; });
        }
        else if (tabName === 'usuarios') {
             headers = ['Email', 'Nome', 'Nível'];
             data.forEach(r => { rows += `<tr data-id="${r.id}"><td>${r.email}</td><td>${r.nome_completo}</td><td>${r.nivel_acesso}</td></tr>`; });
        }

        return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    }

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
        document.getElementById('btn-entrada-uniforme')?.addEventListener('click', () => openModalEntradaGrade());
        document.getElementById('btn-saida-uniforme')?.addEventListener('click', () => openModalSaidaGrade());
        document.getElementById('btn-novo-item')?.addEventListener('click', () => openModalCadastro('catalogo'));
        document.getElementById('btn-nova-unidade')?.addEventListener('click', () => openModalCadastro('unidades'));
        document.getElementById('btn-nova-categoria')?.addEventListener('click', () => openModalCadastro('categorias')); 
        document.getElementById('btn-novo-pedido')?.addEventListener('click', openModalCriarPedido);
        
        document.getElementById('btn-entrada-geral')?.addEventListener('click', () => openModalEntrada(null));
        document.getElementById('btn-entrada-consumo')?.addEventListener('click', () => openModalEntrada('consumo'));
        document.getElementById('btn-entrada-patrimonio')?.addEventListener('click', () => openModalEntrada('permanente'));
        
        document.getElementById('btn-saida-rapida')?.addEventListener('click', openModalSaidaRapida);
        document.getElementById('btn-movimentar-patrimonio')?.addEventListener('click', openModalMovimentarPatrimonio);
        
        // NOVO EVENTO: MARCAR COMO INSERVÍVEL
        document.getElementById('btn-marcar-inservivel')?.addEventListener('click', async () => {
            if(!selectedRowId) return alert('Selecione um item da lista.');
            if(!confirm('Tem certeza que deseja marcar este item como INSERVÍVEL para descarte?')) return;
            
            try {
                // Atualiza flag
                const { error } = await supabase.from('patrimonio').update({ inservivel: true }).eq('id', selectedRowId);
                if(error) throw error;
                
                // Pega dados para historico
                const { data: item } = await supabase.from('patrimonio').select('produto_id, codigo_patrimonio').eq('id', selectedRowId).single();
                
                await registrarHistorico(item.produto_id, 1, 'descarte_patrimonio', `Item ${item.codigo_patrimonio} declarado inservível`, 'Sistema');
                
                alert('Item marcado como inservível.');
                renderTab('patrimonio');
            } catch(e) {
                alert('Erro: ' + e.message);
            }
        });

        document.getElementById('btn-ver-pedido')?.addEventListener('click', () => {
            if(!selectedRowId) return alert('Selecione um pedido.');
            openModalGerenciarPedido(selectedRowId);
        });
        document.getElementById('btn-apagar')?.addEventListener('click', () => handleApagar(tabName));
    }

    async function openModalMovimentarPatrimonio() {
        const { data: itens } = await supabase.from('patrimonio')
            .select('id, codigo_patrimonio, catalogo(nome), unidades:unidade_id(nome)').order('codigo_patrimonio');
        
        const { data: unidades } = await supabase.from('unidades').select('id, nome').order('nome');

        if (!itens || itens.length === 0) return alert("Nenhum item patrimoniado cadastrado.");

        const html = `
            <h3><i class="fas fa-exchange-alt"></i> Movimentar Patrimônio</h3>
            <label>Item (Plaqueta - Nome - Local Atual):</label>
            <select id="mov-pat-item">
                <option value="">-- Selecione o Item --</option>
                ${itens.map(i => {
                    const localAtual = i.unidades?.nome || 'Sem Local';
                    return `<option value="${i.id}" data-nome="${i.catalogo.nome}" data-plaqueta="${i.codigo_patrimonio}">${i.codigo_patrimonio} - ${i.catalogo.nome} (Em: ${localAtual})</option>`;
                }).join('')}
            </select>

            <label>Novo Local (Destino):</label>
            <select id="mov-pat-destino">
                <option value="">-- Selecione o Destino --</option>
                ${unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
            </select>
            <label>Observação:</label><input type="text" id="mov-pat-obs">
            <div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">Cancelar</button><button class="btn-confirmar" id="btn-conf-mov">Confirmar</button></div>`;

        modalContentArea.innerHTML = html;
        modal.style.display = 'block';

        document.getElementById('btn-conf-mov').onclick = async () => {
            const itemSelect = document.getElementById('mov-pat-item');
            const itemId = itemSelect.value;
            const destinoId = document.getElementById('mov-pat-destino').value;
            const obs = document.getElementById('mov-pat-obs').value;

            if (!itemId || !destinoId) return alert("Selecione o item e o novo local.");
            const plaqueta = itemSelect.options[itemSelect.selectedIndex].dataset.plaqueta;

            try {
                const { error: errUpdate } = await supabase.from('patrimonio').update({ unidade_id: destinoId }).eq('id', itemId);
                if (errUpdate) throw errUpdate;

                const { data: patAtual } = await supabase.from('patrimonio').select('produto_id').eq('id', itemId).single();
                await registrarHistorico(patAtual.produto_id, 1, 'transferencia_patrimonio', `Movimentação: ${plaqueta}. Obs: ${obs}`, 'Sistema', destinoId);

                alert("Movimentação realizada!"); closeModal(); renderTab('patrimonio');
            } catch (err) { alert("Erro: " + err.message); }
        };
    }

    async function openModalCadastro(tipo) {
        let html = '';
        if(tipo === 'catalogo') {
            const { data: dbCats } = await supabase.from('categorias').select('*').order('nome');
            const optionsCat = dbCats ? dbCats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('') : '';
            
            html = `<h3>Novo Item</h3>
            <label>Nome:</label><input id="cad-nome" placeholder="Ex: PAPEL A4">
            <div style="display:flex; gap:10px;">
                <div style="flex:1;"><label>Tipo:</label><select id="cad-tipo"><option value="consumo">Consumo</option><option value="permanente">Permanente</option></select></div>
                <div style="flex:1;"><label>Unidade:</label><select id="cad-un"><option value="un">UN</option><option value="cx">CX</option><option value="pct">PCT</option><option value="resma">RESMA</option><option value="kg">KG</option><option value="lt">LT</option><option value="m">M</option><option value="par">PAR</option><option value="jg">JG</option><option value="fd">FD</option></select></div>
            </div>
            <label>Categoria:</label><select id="cad-cat"><option value="">-- Selecione --</option>${optionsCat}</select>
            <div id="div-estoque-min"><label>Estoque Mínimo:</label><input id="cad-min" type="number" value="5"></div>`;
        } 
        else if (tipo === 'unidades') {
            html = `<h3>Nova Unidade</h3><label>Nome:</label><input id="cad-nome"><label>Responsável:</label><input id="cad-resp">`;
        }
        else if (tipo === 'categorias') {
            html = `<h3>Nova Categoria</h3><label>Nome da Categoria:</label><input id="cad-nome" placeholder="Ex: INFORMÁTICA">`;
        }

        modalContentArea.innerHTML = html + `<div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">X</button><button class="btn-confirmar" id="btn-save">Salvar</button></div>`;
        modal.style.display = 'block';
        
        // EVENT LISTENER PARA TIPO (ESCONDER ESTOQUE MINIMO)
        if(tipo === 'catalogo') {
            const selTipo = document.getElementById('cad-tipo');
            const divMin = document.getElementById('div-estoque-min');
            selTipo.addEventListener('change', () => {
                divMin.style.display = (selTipo.value === 'permanente') ? 'none' : 'block';
            });
        }
        
        document.getElementById('btn-save').onclick = async () => {
            const nomeInput = document.getElementById('cad-nome');
            if(!nomeInput.value) return alert("Preencha o nome.");
            const nome = nomeInput.value.toUpperCase();

            if(tipo === 'catalogo') {
                const tipoVal = document.getElementById('cad-tipo').value;
                const minVal = (tipoVal === 'permanente') ? null : document.getElementById('cad-min').value;

                await supabase.from('catalogo').insert([{ 
                    nome: nome, 
                    tipo: tipoVal, 
                    unidade_medida: document.getElementById('cad-un').value, 
                    categoria: document.getElementById('cad-cat').value, 
                    estoque_minimo: minVal 
                }]);
            }
            else if (tipo === 'unidades') await supabase.from('unidades').insert([{ nome: nome, responsavel: document.getElementById('cad-resp').value }]);
            else if (tipo === 'categorias') await supabase.from('categorias').insert([{ nome: nome }]);

            alert('Salvo com sucesso!'); closeModal(); renderTab(activeTab);
        };
    }

    // helpers: tamanhos por tipo (ajuste conforme sua realidade)
    const TAMANHOS_ROUPA = ['RN','P','M','G','EG','10','12','14','16']; // exemplo: creche -> 0-10 etc
    const TAMANHOS_CALCADO = ['20','21','22','23','24','25','26','27','28','29','30'];

    async function openModalEntradaGrade() {
        // busca catalogo filtrando uniformes
        const { data: produtos } = await supabase.from('catalogo').select('id, nome, categoria, tipo').eq('categoria', 'UNIFORMES ESCOLARES').order('nome');
        if(!produtos || produtos.length===0) return alert('Nenhum uniforme cadastrado.');

        const html = `<h3>Entrada por Grade (Uniformes)</h3>
          <label>Produto:</label>
          <select id="grade-prod">${produtos.map(p=>`<option value="${p.id}" data-tipo="${p.tipo}">${p.nome}</option>`).join('')}</select>
          <div id="grade-area" style="margin-top:10px;"></div>
          <label>Observação:</label><input id="grade-obs" placeholder="Ex: Nota / Lote">
          <div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">Cancelar</button><button class="btn-confirmar" id="btn-conf-grade-ent">Confirmar</button></div>`;
        modalContentArea.innerHTML = html; modal.style.display='block';

        const sel = document.getElementById('grade-prod');
        function renderGrade() {
            const tipo = sel.options[sel.selectedIndex].dataset.tipo || 'roupa';
            const use = (tipo && tipo.toLowerCase().includes('calçado')) ? TAMANHOS_CALCADO : TAMANHOS_ROUPA;
            document.getElementById('grade-area').innerHTML = use.map(t=>`<div style="display:flex; gap:8px; align-items:center;"><label style="width:60px">${t}</label><input type="number" min="0" value="0" data-tamanho="${t}" class="inp-tam"></div>`).join('');
        }
        sel.addEventListener('change', renderGrade);
        renderGrade();

        document.getElementById('btn-conf-grade-ent').onclick = async () => {
            const prodId = sel.value;
            const obs = document.getElementById('grade-obs').value || '';
            const inputs = Array.from(document.querySelectorAll('.inp-tam'));
            const changes = inputs.map(i => ({ tamanho: i.dataset.tamanho, qtd: parseInt(i.value)||0 })).filter(x=>x.qtd>0);
            if(!changes.length) return alert('Informe pelo menos 1 quantidade.');

            try {
                // atualizar estoque_tamanhos e estoque_consumo
                for(const ch of changes) {
                    const { data: exists } = await supabase.from('estoque_tamanhos').select('*').eq('produto_id', prodId).eq('tamanho', ch.tamanho).single();
                    if(exists) {
                        await supabase.from('estoque_tamanhos').update({ quantidade: exists.quantidade + ch.qtd }).eq('id', exists.id);
                    } else {
                        await supabase.from('estoque_tamanhos').insert([{ produto_id: prodId, tamanho: ch.tamanho, quantidade: ch.qtd }]);
                    }
                }
                // atualiza estoque_consumo soma total
                const { data: allSizes } = await supabase.from('estoque_tamanhos').select('sum(quantidade)').eq('produto_id', prodId);
                // sum via supabase client isn't always straightforward; em alternativa recalcular localmente:
                const { data: sizesNow } = await supabase.from('estoque_tamanhos').select('quantidade').eq('produto_id', prodId);
                const total = sizesNow.reduce((s,i)=>s + (i.quantidade||0), 0);
                const { data: existTotal } = await supabase.from('estoque_consumo').select('*').eq('produto_id', prodId).single();
                if(existTotal) await supabase.from('estoque_consumo').update({ quantidade_atual: total }).eq('id', existTotal.id);
                else await supabase.from('estoque_consumo').insert([{ produto_id: prodId, quantidade_atual: total }]);

                // registrar historico_global e historico_tamanhos
                // 1) grava resumo no historico_global
                const obsResumo = `Entrada por grade. ${obs} | Detalhe: ${JSON.stringify(changes)}`;
                const { data: hg } = await supabase.from('historico_global').insert([{
                    produto_id: prodId,
                    quantidade: changes.reduce((a,b)=>a+b.qtd,0),
                    tipo_movimento: 'entrada_tamanhos',
                    observacao: obsResumo,
                    responsavel_nome: 'Almoxarifado',
                    usuario_sistema: currentUserId,
                    data_movimentacao: new Date()
                }]).select().single();

                // 2) gravar registros por tamanho relacionando historico_global_id
                for(const ch of changes) {
                    await supabase.from('historico_tamanhos').insert([{
                        historico_global_id: hg.id,
                        produto_id: prodId,
                        tamanho: ch.tamanho,
                        quantidade: ch.qtd,
                        tipo_movimento: 'entrada_tamanhos',
                        responsavel_nome: 'Almoxarifado'
                    }]);
                }

                alert('Entrada por grade registrada.'); closeModal(); renderTab(activeTab);
            } catch(e) { console.error(e); alert('Erro: ' + e.message); }
        };
    }

    async function openModalEntrada(filtroTipo = null) {
        let query = supabase.from('catalogo').select('id, nome, tipo, unidade_medida').order('nome');
        if (filtroTipo) query = query.eq('tipo', filtroTipo);
        const { data: produtos } = await query;
        const { data: unidades } = await supabase.from('unidades').select('id, nome').order('nome');
        
        const html = `
        <h3>Nova Entrada ${filtroTipo ? '(' + filtroTipo.toUpperCase() + ')' : ''}</h3>
        <label>Produto:</label> 
        <select id="inp-ent-produto">
            <option value="">Selecione</option>
            ${produtos.map(p => `<option value="${p.id}" data-tipo="${p.tipo}" data-medida="${p.unidade_medida}">${p.nome}</option>`).join('')}
        </select>
        
        <div id="area-consumo" class="hidden">
            <label>Qtd (<span id="lbl-medida"></span>):</label><input type="number" id="inp-ent-qtd">
            <label>Local de Armazenamento (Físico):</label><input type="text" id="inp-ent-local" placeholder="Ex: Estante 3, Prateleira B">
        </div>

        <div id="area-patrimonio" class="hidden">
            <label>Plaqueta / Código:</label><input type="text" id="inp-ent-plaqueta">
            <label>Estado de Conservação:</label>
            <select id="inp-ent-estado"><option value="novo">Novo</option><option value="bom">Bom</option><option value="regular">Regular</option></select>
            <label>Local de Destino (Unidade):</label>
            <select id="inp-ent-unidade-patrimonio">
                <option value="">-- Selecione o Local --</option>
                ${unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
            </select>
        </div>

        <label>Nota Fiscal / Origem:</label><input type="text" id="inp-ent-nota">
        <div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">X</button><button class="btn-confirmar" id="btn-ok-ent">Confirmar</button></div>`;

        modalContentArea.innerHTML = html; 
        modal.style.display = 'block';
        
        const selProd = document.getElementById('inp-ent-produto');
        selProd.addEventListener('change', () => {
            const opt = selProd.options[selProd.selectedIndex];
            if(!opt.value) return;
            if(opt.dataset.tipo === 'consumo') {
                document.getElementById('area-consumo').classList.remove('hidden');
                document.getElementById('area-patrimonio').classList.add('hidden');
                document.getElementById('lbl-medida').innerText = opt.dataset.medida;
            } else {
                document.getElementById('area-consumo').classList.add('hidden');
                document.getElementById('area-patrimonio').classList.remove('hidden');
            }
        });
        if(produtos.length > 0 && filtroTipo) { selProd.selectedIndex = 1; selProd.dispatchEvent(new Event('change')); }

        document.getElementById('btn-ok-ent').onclick = async () => {
            const prodId = selProd.value;
            const tipo = selProd.options[selProd.selectedIndex].dataset.tipo; 
            const nota = document.getElementById('inp-ent-nota').value;

            if(tipo === 'consumo') {
                const qtd = parseInt(document.getElementById('inp-ent-qtd').value); 
                const local = document.getElementById('inp-ent-local').value;
                if(!qtd) return alert("Informe a quantidade.");
                const { data: existe } = await supabase.from('estoque_consumo').select('*').eq('produto_id', prodId).single();
                if(existe) await supabase.from('estoque_consumo').update({ quantidade_atual: existe.quantidade_atual + qtd }).eq('id', existe.id);
                else await supabase.from('estoque_consumo').insert([{ produto_id: prodId, quantidade_atual: qtd, local_fisico: local }]);
                await registrarHistorico(prodId, qtd, 'entrada', `Nota: ${nota}`, 'Almoxarifado');
                alert('Entrada Realizada!'); closeModal(); renderTab(activeTab);
            } else {
                const plaq = document.getElementById('inp-ent-plaqueta').value; 
                const est = document.getElementById('inp-ent-estado').value;
                const unidId = document.getElementById('inp-ent-unidade-patrimonio').value; 
                if(!plaq || !unidId) return alert("Preencha Plaqueta e Local.");
                try {
                    const { error } = await supabase.from('patrimonio').insert([{ produto_id: prodId, codigo_patrimonio: plaq, estado_conservacao: est, unidade_id: unidId }]);
                    if (error) throw error;
                    await registrarHistorico(prodId, 1, 'entrada_patrimonio', `Plaqueta: ${plaq}`, 'Almoxarifado', unidId);
                    alert('Salvo com Sucesso!'); closeModal(); renderTab(activeTab);
                } catch (e) { alert("Erro: " + e.message); }
            }
        };
    }

    async function openModalSaidaRapida() {
        const { data: estoque } = await supabase.from('estoque_consumo').select('id, quantidade_atual, produto_id, catalogo(nome, unidade_medida)').gt('quantidade_atual', 0).order('id');
        if(!estoque || estoque.length === 0) return alert('Sem itens com saldo.');
        // ORDENAÇÃO
        estoque.sort((a,b) => a.catalogo.nome.localeCompare(b.catalogo.nome));

        const html = `<h3><i class="fas fa-coffee"></i> Saída Rápida</h3><label>Item:</label><select id="inp-saida-id">${estoque.map(e => `<option value="${e.id}" data-prod="${e.produto_id}" data-qtd="${e.quantidade_atual}">${e.catalogo.nome} (Saldo: ${e.quantidade_atual})</option>`).join('')}</select><label>Quantidade:</label><input type="number" id="inp-saida-qtd" min="1" value="1"><label>Responsável/Setor:</label><input type="text" id="inp-saida-resp" placeholder="Ex: Cozinha"><div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">Cancelar</button><button class="btn-confirmar" id="btn-confirmar-saida">Baixar</button></div>`;
        modalContentArea.innerHTML = html; modal.style.display = 'block';

        document.getElementById('btn-confirmar-saida').onclick = async () => {
            const select = document.getElementById('inp-saida-id');
            const prodId = select.options[select.selectedIndex].dataset.prod;
            const saldoAtual = parseInt(select.options[select.selectedIndex].dataset.qtd);
            const qtdRetirar = parseInt(document.getElementById('inp-saida-qtd').value);
            const responsavel = document.getElementById('inp-saida-resp').value;
            if(qtdRetirar > saldoAtual) return alert('Saldo insuficiente.');
            if(!responsavel) return alert('Informe o responsável.');
            await supabase.from('estoque_consumo').update({ quantidade_atual: saldoAtual - qtdRetirar }).eq('id', select.value);
            await registrarHistorico(prodId, qtdRetirar, 'saida_rapida', 'Consumo Interno', responsavel);
            alert('Saída OK!'); closeModal(); renderTab('estoque_consumo');
        };
    }

    async function openModalGerenciarPedido(pedidoId) {
        const { data: pedido } = await supabase.from('pedidos').select('*, unidades(nome)').eq('id', pedidoId).single();
        const { data: itens } = await supabase.from('itens_pedido').select('*, catalogo(nome)').eq('pedido_id', pedidoId);
        const itensHtml = itens.map(i => `<li>${i.catalogo.nome}: ${i.quantidade_solicitada}</li>`).join('');
        const statusOptions = ['pendente', 'em_separacao', 'aguardando_retirada', 'em_transito', 'entregue', 'cancelado'];
        
        const btnImprimir = `<button id="btn-imprimir" style="background:#17a2b8; color:white; border:none; padding:8px; width:100%; margin-bottom:10px; cursor:pointer;">Imprimir Romaneio</button>`;
        modalContentArea.innerHTML = `<h3>Pedido #${pedido.id} (${pedido.unidades.nome})</h3>${btnImprimir}<ul>${itensHtml}</ul><label>Status:</label><select id="inp-novo-status">${statusOptions.map(s => `<option value="${s}" ${s===pedido.status?'selected':''}>${s}</option>`).join('')}</select><div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">X</button><button class="btn-confirmar" id="btn-up-status">Atualizar</button></div>`;
        modal.style.display='block';

        document.getElementById('btn-imprimir').onclick = () => gerarRomaneioPDF(pedido.id, pedido, itens);
        document.getElementById('btn-up-status').onclick = async () => {
            await supabase.from('pedidos').update({ status: document.getElementById('inp-novo-status').value }).eq('id', pedidoId);
            alert('Status Atualizado'); closeModal(); renderTab('pedidos');
        };
    }

    async function openModalCriarPedido() {
        const { data: unidades } = await supabase.from('unidades').select('*').order('nome');
        const { data: produtos } = await supabase.from('catalogo').select('*').order('nome');
        let itensCarrinho = []; 

        const html = `<h3><i class="fas fa-cart-plus"></i> Novo Pedido</h3><label>Destino:</label><select id="ped-destino"><option value="">-- Selecione --</option>${unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}</select><div style="background:#f8f9fa; padding:10px; margin-top:10px;"><h4>Itens</h4><div style="display:flex; gap:10px;"><select id="ped-prod" style="flex:2;"><option value="">-- Produto --</option>${produtos.map(p => `<option value="${p.id}" data-nome="${p.nome}">${p.nome} (${p.unidade_medida})</option>`).join('')}</select><input type="number" id="ped-qtd" placeholder="Qtd" style="flex:1;" min="1"><button id="btn-add-item">+</button></div></div><ul id="lista-carrinho" style="background:white; border:1px solid #ccc; padding:10px;"><li>Vazio</li></ul><label>Obs:</label><input type="text" id="ped-obs"><div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">Cancelar</button><button class="btn-confirmar" id="btn-finalizar-pedido">Gerar</button></div>`;
    
        modalContentArea.innerHTML = html; modal.style.display = 'block';

        const btnAdd = document.getElementById('btn-add-item');
        const listaUl = document.getElementById('lista-carrinho');
        const renderLista = () => { listaUl.innerHTML = itensCarrinho.length ? itensCarrinho.map((it, i) => `<li>${it.nome} - <b>${it.qtd}</b> <span onclick="window.removerItemCarrinho(${i})">X</span></li>`).join('') : '<li>Vazio</li>'; };

        btnAdd.onclick = () => {
            const selProd = document.getElementById('ped-prod');
            const id = selProd.value; const nome = selProd.options[selProd.selectedIndex].dataset.nome; const qtd = parseInt(document.getElementById('ped-qtd').value);
            if (!id || !qtd) return;
            const exist = itensCarrinho.findIndex(i => i.id === id);
            if (exist !== -1) itensCarrinho[exist].qtd += qtd; else itensCarrinho.push({ id, nome, qtd });
            renderLista(); selProd.value = ""; document.getElementById('ped-qtd').value = "";
        };

        window.removerItemCarrinho = (idx) => { itensCarrinho.splice(idx, 1); renderLista(); };
        document.getElementById('btn-finalizar-pedido').onclick = async () => {
            const destinoId = document.getElementById('ped-destino').value; const obs = document.getElementById('ped-obs').value;
            if (!destinoId || !itensCarrinho.length) return alert("Preencha tudo.");
            const { data: ped } = await supabase.from('pedidos').insert([{ unidade_destino_id: destinoId, status: 'pendente', observacoes: obs, solicitante_id: currentUserId }]).select().single();
            await supabase.from('itens_pedido').insert(itensCarrinho.map(it => ({ pedido_id: ped.id, produto_id: it.id, quantidade_solicitada: it.qtd, quantidade_atendida: 0 })));
            alert("Pedido criado!"); closeModal(); renderTab('pedidos');
        };
    }

    async function openModalSaidaGrade() {
        const { data: produtos } = await supabase.from('catalogo').select('id, nome, categoria, tipo').eq('categoria','UNIFORMES ESCOLARES').order('nome');
        if(!produtos || produtos.length===0) return alert('Nenhum uniforme cadastrado.');
        const html = `<h3>Saída por Grade (Uniformes)</h3>
          <label>Produto:</label>
          <select id="grade-prod-out">${produtos.map(p=>`<option value="${p.id}" data-tipo="${p.tipo}">${p.nome}</option>`).join('')}</select>
          <div id="grade-area-out" style="margin-top:10px;"></div>
          <label>Responsável/Unidade:</label><input id="grade-resp" placeholder="Nome / Setor">
          <label>Observação:</label><input id="grade-obs-out" placeholder="Ex: Entrega a unidade X">
          <div class="modal-buttons"><button class="btn-cancelar" onclick="closeModal()">Cancelar</button><button class="btn-confirmar" id="btn-conf-grade-out">Confirmar Saída</button></div>`;
        modalContentArea.innerHTML = html; modal.style.display='block';

        const sel = document.getElementById('grade-prod-out');
        function renderGradeOut() {
        const tipo = sel.options[sel.selectedIndex].dataset.tipo || 'roupa';
        const use = (tipo && tipo.toLowerCase().includes('calçado')) ? TAMANHOS_CALCADO : TAMANHOS_ROUPA;
        // busca saldo atual por tamanho e monta inputs com max
        (async () => {
            const prodId = sel.value;
            const { data: saldos } = await supabase.from('estoque_tamanhos').select('tamanho, quantidade').eq('produto_id', prodId);
            const mapS = {};
            (saldos||[]).forEach(s => mapS[s.tamanho] = s.quantidade);
            document.getElementById('grade-area-out').innerHTML = use.map(t=>`<div style="display:flex; gap:8px; align-items:center;"><label style="width:60px">${t}</label><input type="number" min="0" value="0" data-tamanho="${t}" class="inp-tam-out" max="${mapS[t]||0}"><small style="color:#666;margin-left:8px;">Saldo: ${mapS[t]||0}</small></div>`).join('');
        })();
    }
    sel.addEventListener('change', renderGradeOut);
    renderGradeOut();

    document.getElementById('btn-conf-grade-out').onclick = async () => {
        const prodId = sel.value;
        const resp = document.getElementById('grade-resp').value || 'Desconhecido';
        const obs = document.getElementById('grade-obs-out').value || '';
        const inputs = Array.from(document.querySelectorAll('.inp-tam-out'));
        const changes = inputs.map(i => ({ tamanho: i.dataset.tamanho, qtd: parseInt(i.value)||0 })).filter(x=>x.qtd>0);
        if(!changes.length) return alert('Informe pelo menos 1 quantidade.');

        try {
            // checar saldo e subtrair
            for(const ch of changes) {
                const { data: exists } = await supabase.from('estoque_tamanhos').select('*').eq('produto_id', prodId).eq('tamanho', ch.tamanho).single();
                const atual = exists ? (exists.quantidade||0) : 0;
                if(ch.qtd > atual) return alert(`Saldo insuficiente para tamanho ${ch.tamanho}. Saldo: ${atual}`);
            }
            // atualizar quantidades
            for(const ch of changes) {
                const { data: exists } = await supabase.from('estoque_tamanhos').select('*').eq('produto_id', prodId).eq('tamanho', ch.tamanho).single();
                const novo = (exists.quantidade||0) - ch.qtd;
                await supabase.from('estoque_tamanhos').update({ quantidade: novo }).eq('id', exists.id);
            }
            // recalcular total
            const { data: sizesNow } = await supabase.from('estoque_tamanhos').select('quantidade').eq('produto_id', prodId);
            const total = sizesNow.reduce((s,i)=>s + (i.quantidade||0), 0);
            const { data: existTotal } = await supabase.from('estoque_consumo').select('*').eq('produto_id', prodId).single();
            if(existTotal) await supabase.from('estoque_consumo').update({ quantidade_atual: total }).eq('id', existTotal.id);
            else await supabase.from('estoque_consumo').insert([{ produto_id: prodId, quantidade_atual: total }]);

            // registrar historico_global e historico_tamanhos
                const obsResumo = `Saída por grade. ${obs} | Detalhe: ${JSON.stringify(changes)}`;
                const { data: hg } = await supabase.from('historico_global').insert([{
                    produto_id: prodId,
                    quantidade: changes.reduce((a,b)=>a+b.qtd,0),
                    tipo_movimento: 'saida_tamanhos',
                    observacao: obsResumo,
                    responsavel_nome: resp,
                    usuario_sistema: currentUserId,
                    data_movimentacao: new Date()
                }]).select().single();

                for(const ch of changes) {
                    await supabase.from('historico_tamanhos').insert([{
                        historico_global_id: hg.id,
                        produto_id: prodId,
                        tamanho: ch.tamanho,
                        quantidade: ch.qtd,
                        tipo_movimento: 'saida_tamanhos',
                        responsavel_nome: resp
                    }]);
                }

                alert('Saída por grade registrada.'); closeModal(); renderTab(activeTab);
            } catch(e) { console.error(e); alert('Erro: ' + e.message); }
        };
    }


    function renderCalculadora() {
        const html = `
        <div style="max-width: 600px; margin: 40px auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); font-family: 'Segoe UI', sans-serif;">
            <h3 style="color: #007bff; margin-top: 0; margin-bottom: 10px; font-size: 1.4em;">
                <i class="fas fa-calculator"></i> Calculadora de Conversão
            </h3>
            <p style="color: #6c757d; font-size: 0.95em; margin-bottom: 25px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
                Calcule rapidamente quantas caixas ou pacotes são necessários.
            </p>

            <div style="margin-bottom: 20px;">
                <label style="font-weight: 600; display: block; margin-bottom: 8px; color: #333;">1. Quantidade Total Desejada (Unidades):</label>
                <input type="number" id="calc-total" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 1em; box-sizing: border-box;" placeholder="Ex: 37">
            </div>

            <div style="display: flex; gap: 20px; margin-bottom: 25px;">
                <div style="flex: 1;">
                    <label style="font-weight: 600; display: block; margin-bottom: 8px; color: #333;">2. Tipo de Medida:</label>
                    <select id="calc-medida" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 1em; background-color: white; box-sizing: border-box;">
                        <option value="Caixa(s)">Caixa(s)</option>
                        <option value="Pacote(s)">Pacote(s)</option>
                        <option value="Fardo(s)">Fardo(s)</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="font-weight: 600; display: block; margin-bottom: 8px; color: #333;">3. Unidades por Medida:</label>
                    <input type="number" id="calc-qtd-medida" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 1em; box-sizing: border-box;" placeholder="Ex: 12">
                </div>
            </div>

            <button id="btn-calcular" style="width: 100%; background-color: #007bff; color: white; padding: 14px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1.1em; transition: background 0.2s;">
                = CALCULAR
            </button>

            <div id="calc-resultado" style="margin-top: 30px; padding: 20px; background-color: #e9ecef; border-radius: 8px; display: none; color: #333;">
                </div>
        </div>`;
        
        tabContentArea.innerHTML = html;

        document.getElementById('btn-calcular').addEventListener('click', () => {
            const total = parseInt(document.getElementById('calc-total').value);
            const nome = document.getElementById('calc-medida').value;
            const qtdPorTipo = parseInt(document.getElementById('calc-qtd-medida').value);

            if (!total || !qtdPorTipo) return;

            const inteiros = Math.floor(total / qtdPorTipo);
            const avulsos = total % qtdPorTipo;

            const divRes = document.getElementById('calc-resultado');
            divRes.style.display = 'block';
            divRes.innerHTML = `
                <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 15px;">Resultado:</h4>
                <p style="font-size: 1.1em; margin: 0;">Você precisa de <strong>${inteiros} ${nome}</strong> fechada(s).</p>
                ${avulsos > 0 ? `<p style="color: #dc3545; font-weight: bold; margin-top: 10px;">+ ${avulsos} unidades avulsas.</p>` : ''}
            `;
        });
    }
    function renderMenuRelatorios() {
        const html = `
        <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;">
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: #dc3545; margin-bottom: 10px;"></i>
                <h4>Alerta de Estoque Baixo</h4><button onclick="window.gerarRelatorio('estoque_baixo')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Gerar PDF</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-arrow-down" style="font-size: 3em; color: #28a745; margin-bottom: 10px;"></i>
                <h4>Entradas no Período</h4><button onclick="window.prepararRelatorioData('entradas')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Selecionar</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-arrow-up" style="font-size: 3em; color: #ffc107; margin-bottom: 10px;"></i>
                <h4>Saídas no Período</h4><button onclick="window.prepararRelatorioData('saidas')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Selecionar</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-map-marker-alt" style="font-size: 3em; color: #17a2b8; margin-bottom: 10px;"></i>
                <h4>Saídas por Local</h4><button onclick="window.prepararRelatorioLocal()" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Selecionar</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-chair" style="font-size: 3em; color: #6f42c1; margin-bottom: 10px;"></i>
                <h4>Inventário Patrimonial</h4><button onclick="window.gerarRelatorio('patrimonio_total')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Gerar PDF</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-trash-alt" style="font-size: 3em; color: #343a40; margin-bottom: 10px;"></i>
                <h4>Itens Inservíveis</h4><button onclick="window.gerarRelatorio('patrimonio_inservivel')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Gerar PDF</button>
            </div>
            <div class="card-relatorio" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 300px; text-align: center;">
                <i class="fas fa-box-open" style="font-size: 3em; color: #fd7e14; margin-bottom: 10px;"></i>
                <h4>Inventário de Consumo</h4><button onclick="window.gerarRelatorio('consumo_total')" style="background: var(--color-primary); color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 10px;">Gerar PDF</button>
            </div>
        </div>`;
        tabContentArea.innerHTML = html;
    }
    window.prepararRelatorioData = (t) => { modalContentArea.innerHTML = `<h3>Periodo</h3><input type="date" id="rel-dt-ini"><input type="date" id="rel-dt-fim"><button onclick="window.gerarRelatorio('${t}', {dtIni:document.getElementById('rel-dt-ini').value, dtFim:document.getElementById('rel-dt-fim').value})">Gerar</button>`; modal.style.display='block'; }
    window.prepararRelatorioLocal = async () => { const { data: u } = await supabase.from('unidades').select('*'); modalContentArea.innerHTML = `<h3>Saídas por Local</h3><select id="rel-loc">${u.map(x=>`<option value="${x.id}">${x.nome}</option>`)}</select><input type="date" id="rel-dt-ini"><input type="date" id="rel-dt-fim"><button onclick="window.gerarRelatorio('saidas_local', {dtIni:document.getElementById('rel-dt-ini').value, dtFim:document.getElementById('rel-dt-fim').value, localId:document.getElementById('rel-loc').value, localNome:document.getElementById('rel-loc').options[document.getElementById('rel-loc').selectedIndex].text})">Gerar</button>`; modal.style.display='block'; }

    window.gerarRelatorio = async (tipo, params={}) => {
        const { jsPDF } = window.jspdf; 
        const doc = new jsPDF();
        let head=[], body=[], title="";
        
        const dtIni = params.dtIni ? params.dtIni + ' 00:00:00' : null;
        const dtFim = params.dtFim ? params.dtFim + ' 23:59:59' : null;

        try {
            if(tipo === 'estoque_baixo'){
                title="Relatorio: Estoque Baixo"; 
                head=[['Item','Categoria', 'Qtd Atual','Minimo']];
                const {data} = await supabase.from('estoque_consumo')
                    .select('quantidade_atual, catalogo(nome, estoque_minimo, categoria)');
                
                if(data) {
                    body = data.filter(i => i.catalogo && i.quantidade_atual <= i.catalogo.estoque_minimo)
                        .map(i => [i.catalogo.nome, i.catalogo.categoria, i.quantidade_atual, i.catalogo.estoque_minimo]);
                }

            } else if(tipo === 'patrimonio_total'){
                title="Inventario Patrimonial (Ativos)"; 
                head=[['Plaqueta','Item','Local', 'Estado']];
                // Busca tudo
                const {data, error} = await supabase.from('patrimonio')
                    .select('codigo_patrimonio, estado_conservacao, inservivel, catalogo(nome), unidades!unidade_id(nome)');
                if(error) throw error;
                
                // FILTRO: Apenas os que NÃO são inservíveis
                body = data.filter(i => !i.inservivel)
                           .map(i => [i.codigo_patrimonio, i.catalogo?.nome || '?', i.unidades?.nome || 'Sem Local', i.estado_conservacao]);

            } else if(tipo === 'patrimonio_inservivel'){
                // NOVO RELATÓRIO
                title="Relatorio de Bens Inserviveis (Descarte)"; 
                head=[['Plaqueta','Item','Ultimo Local', 'Status']];
                
                const {data, error} = await supabase.from('patrimonio')
                    .select('codigo_patrimonio, estado_conservacao, inservivel, catalogo(nome), unidades!unidade_id(nome)');
                if(error) throw error;
                
                // FILTRO: Apenas os que SÃO inservíveis
                body = data.filter(i => i.inservivel)
                           .map(i => [i.codigo_patrimonio, i.catalogo?.nome || '?', i.unidades?.nome || '-', 'INSERVIVEL']);

            } else if(tipo === 'consumo_total'){
                title="Inventario Geral de Consumo"; 
                head=[['Produto','Qtd Total','Local Fisico']];
                const {data} = await supabase.from('estoque_consumo').select('quantidade_atual, local_fisico, catalogo(nome)');
                body = data.map(i => [i.catalogo?.nome || '?', i.quantidade_atual, i.local_fisico||'-']);

            } else if(tipo === 'entradas'){
                title=`Relatorio de Entradas (${params.dtIni} a ${params.dtFim})`;
                head=[['Data', 'Item', 'Qtd', 'Obs']];
                const {data} = await supabase.from('historico_global')
                    .select('data_movimentacao, quantidade, observacao, catalogo(nome)')
                    .ilike('tipo_movimento', '%entrada%')
                    .gte('data_movimentacao', dtIni).lte('data_movimentacao', dtFim).order('data_movimentacao');

                body = data.map(i => [new Date(i.data_movimentacao).toLocaleDateString(), i.catalogo?.nome || '?', i.quantidade, i.observacao || '-']);

            } else if(tipo === 'saidas'){
                title=`Relatorio de Saidas (${params.dtIni} a ${params.dtFim})`;
                head=[['Data', 'Item', 'Qtd', 'Destino/Resp']];
                const {data} = await supabase.from('historico_global')
                    .select('data_movimentacao, quantidade, responsavel_nome, catalogo(nome)')
                    .ilike('tipo_movimento', '%saida%')
                    .gte('data_movimentacao', dtIni).lte('data_movimentacao', dtFim).order('data_movimentacao');

                body = data.map(i => [new Date(i.data_movimentacao).toLocaleDateString(), i.catalogo?.nome || '?', i.quantidade, i.responsavel_nome || '-']);

            } else if(tipo === 'saidas_local'){
                title=`Saidas para: ${params.localNome} (${params.dtIni} a ${params.dtFim})`; 
                head=[['Data','Item','Qtd', 'Resp']];
                const {data} = await supabase.from('historico_global')
                    .select('data_movimentacao, quantidade, responsavel_nome, catalogo(nome)')
                    .eq('unidade_destino_id', params.localId)
                    .ilike('tipo_movimento', '%saida%')
                    .gte('data_movimentacao', dtIni).lte('data_movimentacao', dtFim);
                
                if(data) body = data.map(i => [new Date(i.data_movimentacao).toLocaleDateString(), i.catalogo?.nome || '?', i.quantidade, i.responsavel_nome || '-']);
            }

            if(!body || body.length === 0) { alert("Sem dados para este relatorio."); return; }

            doc.text(title, 10, 10);
            doc.autoTable({head: head, body: body, startY: 15, theme: 'grid'});
            doc.save(`relatorio_${tipo}.pdf`);
            closeModal();

        } catch(e) { console.error(e); alert("Erro ao gerar PDF: " + e.message); }
    };
    function gerarRomaneioPDF(id, ped, itens) {
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        const h = doc.internal.pageSize.height / 4;
        for(let i=0; i<4; i++) {
            let y = (i*h)+10;
            doc.setFontSize(10); doc.text(`ROMANEIO #${id} - VIA ${i+1}`, 10, y);
            doc.text(`Destino: ${ped.unidades.nome}`, 10, y+5);
            doc.autoTable({startY:y+10, head:[['Item','Qtd']], body:itens.map(x=>[x.catalogo.nome, x.quantidade_solicitada]), margin:{left:10}, theme:'grid'});
        }
        doc.save(`romaneio_${id}.pdf`);
    }

    window.closeModal = () => { modal.style.display = 'none'; }
    async function handleApagar(tabName) { if(selectedRowId && confirm('Apagar?')) { await supabase.from(tabName).delete().eq('id', selectedRowId); renderTab(tabName); } }
    window.onclick = (ev) => { if(ev.target == modal) closeModal(); }
});