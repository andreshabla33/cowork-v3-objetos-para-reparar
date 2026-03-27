import { supabase } from '../lib/supabase';
import { ChatMessage, ChatGroup } from '../types';

export const ChatService = {
  // Enviar mensaje a la base de datos
  async sendMessage(content: string, userId: string, workspaceId: string, recipientIds: string[]) {
    try {
      console.log('💬 ChatService.sendMessage:', { content, userId, workspaceId, recipientIds });
      
      // Para cada destinatario, buscamos o creamos un chat directo y guardamos el mensaje
      const promises = recipientIds.map(async (recipientId) => {
        const groupId = await this.getOrCreateDirectChat(userId, recipientId, workspaceId);
        console.log('💬 Got groupId for recipient', recipientId, ':', groupId);
        
        if (groupId) {
          const { data, error } = await supabase.from('mensajes_chat').insert({
            grupo_id: groupId,
            usuario_id: userId,
            contenido: content,
            tipo: 'texto'
          }).select().single();
          
          if (error) {
            console.error('💬 Error inserting message:', error);
          } else {
            console.log('💬 Message saved successfully:', data?.id);
          }
        }
      });

      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Error sending messages:', error);
      return false;
    }
  },

  // Obtener o crear un grupo de chat directo entre dos usuarios
  async getOrCreateDirectChat(userA: string, userB: string, workspaceId: string): Promise<string | null> {
    try {
      console.log('💬 getOrCreateDirectChat:', { userA, userB, workspaceId });
      
      // MÉTODO 1: Buscar por nombre del grupo (ChatPanel usa nombre con IDs)
      // El nombre puede ser "userA|userB" o "userB|userA"
      const namePattern1 = `${userA}|${userB}`;
      const namePattern2 = `${userB}|${userA}`;
      
      const { data: groupByName } = await supabase
        .from('grupos_chat')
        .select('id')
        .eq('tipo', 'directo')
        .eq('espacio_id', workspaceId)
        .or(`nombre.eq.${namePattern1},nombre.eq.${namePattern2}`)
        .limit(1)
        .single();
      
      if (groupByName) {
        console.log('💬 Found existing direct chat by name:', groupByName.id);
        return groupByName.id;
      }
      
      // MÉTODO 2: Buscar por miembros (respaldo)
      const { data: userGroups, error: userGroupsError } = await supabase
        .from('miembros_grupo')
        .select('grupo_id')
        .eq('usuario_id', userA);
      
      console.log('💬 User A groups:', userGroups, 'Error:', userGroupsError);
        
      if (userGroups && userGroups.length > 0) {
        const groupIds = userGroups.map(g => g.grupo_id);
        
        // Buscar cuál de estos grupos tiene al usuario B y es tipo directo
        const { data: commonGroup, error: commonError } = await supabase
          .from('miembros_grupo')
          .select('grupo_id, grupos_chat!inner(tipo)')
          .in('grupo_id', groupIds)
          .eq('usuario_id', userB)
          .eq('grupos_chat.tipo', 'directo')
          .limit(1)
          .single();
        
        console.log('💬 Common group search:', commonGroup, 'Error:', commonError);
          
        if (commonGroup) {
          console.log('💬 Found existing direct chat by members:', commonGroup.grupo_id);
          return commonGroup.grupo_id;
        }
      }

      // Si no existe, crear el grupo
      console.log('💬 Creating new direct chat group...');
      const { data: newGroup, error: groupError } = await supabase
        .from('grupos_chat')
        .insert({
          espacio_id: workspaceId,
          nombre: 'Directo',
          tipo: 'directo',
          creado_por: userA
        })
        .select()
        .single();

      if (groupError || !newGroup) {
        console.error('💬 Error creating group:', groupError);
        return null;
      }
      
      console.log('💬 New group created:', newGroup.id);

      // Añadir miembros
      const { error: membersError } = await supabase.from('miembros_grupo').insert([
        { grupo_id: newGroup.id, usuario_id: userA },
        { grupo_id: newGroup.id, usuario_id: userB }
      ]);
      
      if (membersError) {
        console.error('💬 Error adding members:', membersError);
      } else {
        console.log('💬 Members added successfully');
      }

      return newGroup.id;

    } catch (error) {
      console.error('💬 Error in getOrCreateDirectChat:', error);
      return null;
    }
  }
};
